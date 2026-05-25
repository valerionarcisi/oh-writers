import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { ResultAsync, ok, err, okAsync } from "neverthrow";
import {
  locationRequirements,
  locationCandidates,
  locationRequirementScenes,
  locationPhotos,
  breakdownElements,
  breakdownOccurrences,
} from "@oh-writers/db/schema";
import {
  LocationRequirementSchema,
  LocationCandidateSchema,
  PatchLocationCandidateSchema,
  type LocationRequirement,
  type LocationCandidate,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { withProjectAccess } from "~/server/pipeline";
import { requireProjectAccess } from "~/server/access";
import {
  DbError,
  ForbiddenError,
  LocationRequirementNotFoundError,
  LocationCandidateNotFoundError,
} from "../locations.errors";
import { normaliseRequirements } from "./normalise.server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseCandidate = (
  row: typeof locationCandidates.$inferSelect,
  photos: (typeof locationPhotos.$inferSelect)[],
): LocationCandidate =>
  LocationCandidateSchema.parse({
    ...row,
    photos: photos.map((p) => ({
      ...p,
      uploadedAt: p.uploadedAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

const parseRequirement = (
  row: typeof locationRequirements.$inferSelect,
  sceneCount: number,
  candidates: LocationCandidate[],
): LocationRequirement =>
  LocationRequirementSchema.parse({
    ...row,
    sceneCount,
    candidates,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

const findRequirementRow = (
  db: Db,
  requirementId: string,
): ResultAsync<
  typeof locationRequirements.$inferSelect,
  LocationRequirementNotFoundError | DbError
> =>
  ResultAsync.fromPromise(
    db.query.locationRequirements.findFirst({
      where: eq(locationRequirements.id, requirementId),
    }),
    (e) => new DbError("findRequirementRow", e),
  ).andThen((row) =>
    row ? ok(row) : err(new LocationRequirementNotFoundError(requirementId)),
  );

const findCandidateRow = (
  db: Db,
  candidateId: string,
): ResultAsync<
  typeof locationCandidates.$inferSelect,
  LocationCandidateNotFoundError | DbError
> =>
  ResultAsync.fromPromise(
    db.query.locationCandidates.findFirst({
      where: eq(locationCandidates.id, candidateId),
    }),
    (e) => new DbError("findCandidateRow", e),
  ).andThen((row) =>
    row ? ok(row) : err(new LocationCandidateNotFoundError(candidateId)),
  );

const loadRequirementsForProject = (
  db: Db,
  projectId: string,
): ResultAsync<LocationRequirement[], DbError> =>
  ResultAsync.fromPromise(
    db
      .select()
      .from(locationRequirements)
      .where(eq(locationRequirements.projectId, projectId)),
    (e) => new DbError("loadRequirements", e),
  ).andThen((rows) => {
    if (rows.length === 0) return ok([]);

    const reqIds = rows.map((r) => r.id);

    return ResultAsync.fromPromise(
      Promise.all([
        db
          .select()
          .from(locationCandidates)
          .where(inArray(locationCandidates.requirementId, reqIds)),
        db
          .select()
          .from(locationRequirementScenes)
          .where(inArray(locationRequirementScenes.requirementId, reqIds)),
      ]),
      (e) => new DbError("loadRequirements/candidates", e),
    ).andThen(([candidates, reqScenes]) => {
      if (candidates.length === 0) {
        const reqs = rows.map((r) => {
          const sceneCount = reqScenes.filter(
            (s) => s.requirementId === r.id,
          ).length;
          return parseRequirement(r, sceneCount, []);
        });
        return ok(reqs);
      }

      const candIds = candidates.map((c) => c.id);

      return ResultAsync.fromPromise(
        db
          .select()
          .from(locationPhotos)
          .where(inArray(locationPhotos.candidateId, candIds)),
        (e) => new DbError("loadRequirements/photos", e),
      ).map((photos) => {
        return rows.map((r) => {
          const sceneCount = reqScenes.filter(
            (s) => s.requirementId === r.id,
          ).length;
          const reqCandidates = candidates
            .filter((c) => c.requirementId === r.id)
            .map((c) => {
              const candPhotos = photos.filter((p) => p.candidateId === c.id);
              return parseCandidate(c, candPhotos);
            });
          return parseRequirement(r, sceneCount, reqCandidates);
        });
      });
    });
  });

// ─── Server functions ─────────────────────────────────────────────────────────

export const getLocationRequirements = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "view", ({ db, access }) =>
        loadRequirementsForProject(db, access.project.id),
      ),
    ),
  );

export const addLocationRequirement = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1).max(300),
      intExt: z.enum(["INT", "EXT", "INT/EXT"]).nullable().optional(),
      timeOfDay: z.array(z.string()).optional(),
      description: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
        ResultAsync.fromPromise(
          db
            .insert(locationRequirements)
            .values({
              projectId: access.project.id,
              name: data.name,
              intExt: data.intExt ?? null,
              timeOfDay: data.timeOfDay ?? [],
              description: data.description ?? null,
            })
            .returning(),
          (e) => new DbError("addLocationRequirement", e),
        ).andThen(() => loadRequirementsForProject(db, access.project.id)),
      ),
    ),
  );

const MAX_PHOTOS_PER_CANDIDATE = 3;
const PHOTO_MAX_WIDTH_PX = 800;

// SECURITY TODO: API key is embedded inline in the stored URL. Move to a server-side
// proxy endpoint (e.g. /api/places-photo?name=...) before exposing these URLs publicly.
// Same exposure pattern as cesare-tools.ts:buildPlacePhotoUrl.
const buildPlacePhotoUrl = (photoName: string, apiKey: string): string =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&key=${apiKey}`;

export const addLocationCandidate = createServerFn({ method: "POST" })
  .validator(
    z.object({
      requirementId: z.string().uuid(),
      projectId: z.string().uuid(),
      candidate: z.object({
        name: z.string().min(1).max(300),
        address: z.string().nullable().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        contactName: z.string().nullable().optional(),
        contactEmail: z.string().nullable().optional(),
        contactPhone: z.string().nullable().optional(),
        estimatedDailyFee: z.number().nullable().optional(),
        permitRequired: z.boolean().nullable().optional(),
        permitNotes: z.string().nullable().optional(),
        availableFrom: z.string().nullable().optional(),
        availableTo: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        aiSuggested: z.boolean().optional(),
        aiReasoning: z.string().nullable().optional(),
        photoNames: z.array(z.string()).optional(),
      }),
    }),
  )
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
        ResultAsync.fromPromise(
          db
            .insert(locationCandidates)
            .values({
              requirementId: data.requirementId,
              name: data.candidate.name,
              address: data.candidate.address ?? null,
              lat: data.candidate.lat ?? null,
              lng: data.candidate.lng ?? null,
              contactName: data.candidate.contactName ?? null,
              contactEmail: data.candidate.contactEmail ?? null,
              contactPhone: data.candidate.contactPhone ?? null,
              estimatedDailyFee: data.candidate.estimatedDailyFee ?? null,
              permitRequired: data.candidate.permitRequired ?? null,
              permitNotes: data.candidate.permitNotes ?? null,
              availableFrom: data.candidate.availableFrom ?? null,
              availableTo: data.candidate.availableTo ?? null,
              notes: data.candidate.notes ?? null,
              aiSuggested: data.candidate.aiSuggested ?? false,
              aiReasoning: data.candidate.aiReasoning ?? null,
            })
            .returning({ id: locationCandidates.id }),
          (e) => new DbError("addLocationCandidate", e),
        )
          .andThen((inserted) => {
            const candidateId = inserted[0]?.id;
            const photoNames = (data.candidate.photoNames ?? [])
              .filter((n) => typeof n === "string" && n.startsWith("places/"))
              .slice(0, MAX_PHOTOS_PER_CANDIDATE);
            const apiKey = process.env["GOOGLE_PLACES_API_KEY"];

            if (!candidateId || photoNames.length === 0 || !apiKey) {
              return ResultAsync.fromSafePromise(Promise.resolve());
            }

            return ResultAsync.fromPromise(
              db.insert(locationPhotos).values(
                photoNames.map((photoName) => ({
                  candidateId,
                  url: buildPlacePhotoUrl(photoName, apiKey),
                  caption: null,
                })),
              ),
              (e) => new DbError("addLocationCandidate/photos", e),
            ).map(() => undefined);
          })
          .andThen(() => loadRequirementsForProject(db, access.project.id)),
      ),
    ),
  );

export const updateLocationCandidate = createServerFn({ method: "POST" })
  .validator(
    z.object({
      candidateId: z.string().uuid(),
      projectId: z.string().uuid(),
      patch: PatchLocationCandidateSchema,
    }),
  )
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
        findCandidateRow(db, data.candidateId).andThen((candidate) => {
          const patch = {
            ...(data.patch.name !== undefined && { name: data.patch.name }),
            ...(data.patch.address !== undefined && {
              address: data.patch.address,
            }),
            ...(data.patch.lat !== undefined && { lat: data.patch.lat }),
            ...(data.patch.lng !== undefined && { lng: data.patch.lng }),
            ...(data.patch.contactName !== undefined && {
              contactName: data.patch.contactName,
            }),
            ...(data.patch.contactEmail !== undefined && {
              contactEmail: data.patch.contactEmail,
            }),
            ...(data.patch.contactPhone !== undefined && {
              contactPhone: data.patch.contactPhone,
            }),
            ...(data.patch.estimatedDailyFee !== undefined && {
              estimatedDailyFee: data.patch.estimatedDailyFee,
            }),
            ...(data.patch.permitRequired !== undefined && {
              permitRequired: data.patch.permitRequired,
            }),
            ...(data.patch.permitNotes !== undefined && {
              permitNotes: data.patch.permitNotes,
            }),
            ...(data.patch.availableFrom !== undefined && {
              availableFrom: data.patch.availableFrom,
            }),
            ...(data.patch.availableTo !== undefined && {
              availableTo: data.patch.availableTo,
            }),
            ...(data.patch.notes !== undefined && { notes: data.patch.notes }),
            ...(data.patch.status !== undefined && {
              status: data.patch.status,
            }),
            updatedAt: new Date(),
          };

          return ResultAsync.fromPromise(
            db
              .update(locationCandidates)
              .set(patch)
              .where(eq(locationCandidates.id, data.candidateId)),
            (e) => new DbError("updateLocationCandidate", e),
          ).andThen(() => loadRequirementsForProject(db, access.project.id));
        }),
      ),
    ),
  );

export const confirmLocationCandidate = createServerFn({ method: "POST" })
  .validator(
    z.object({
      requirementId: z.string().uuid(),
      candidateId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
        ResultAsync.fromPromise(
          Promise.all([
            db
              .update(locationRequirements)
              .set({
                confirmedCandidateId: data.candidateId,
                status: "confirmed",
                updatedAt: new Date(),
              })
              .where(eq(locationRequirements.id, data.requirementId)),
            db
              .update(locationCandidates)
              .set({ status: "confirmed", updatedAt: new Date() })
              .where(eq(locationCandidates.id, data.candidateId)),
          ]),
          (e) => new DbError("confirmLocationCandidate", e),
        ).andThen(() => loadRequirementsForProject(db, access.project.id)),
      ),
    ),
  );

export const removeLocationCandidate = createServerFn({ method: "POST" })
  .validator(
    z.object({
      candidateId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
        ResultAsync.fromPromise(
          db
            .delete(locationCandidates)
            .where(eq(locationCandidates.id, data.candidateId)),
          (e) => new DbError("removeLocationCandidate", e),
        ).andThen(() => loadRequirementsForProject(db, access.project.id)),
      ),
    ),
  );

export const syncRequirementsFromBreakdown = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
        ResultAsync.fromPromise(
          db
            .select()
            .from(breakdownElements)
            .where(
              and(
                eq(breakdownElements.projectId, access.project.id),
                eq(breakdownElements.category, "locations"),
              ),
            ),
          (e) => new DbError("syncRequirements/loadElements", e),
        ).andThen((elements) => {
          if (elements.length === 0) {
            return loadRequirementsForProject(db, access.project.id);
          }

          return ResultAsync.fromPromise(
            db
              .select({ name: locationRequirements.name })
              .from(locationRequirements)
              .where(eq(locationRequirements.projectId, access.project.id)),
            (e) => new DbError("syncRequirements/loadExisting", e),
          ).andThen((existing) => {
            const existingNames = new Set(
              existing.map((r) => r.name.toLowerCase()),
            );
            const newElements = elements.filter(
              (el) => !existingNames.has(el.name.toLowerCase()),
            );

            if (newElements.length === 0) {
              return loadRequirementsForProject(db, access.project.id);
            }

            return ResultAsync.fromPromise(
              db
                .insert(locationRequirements)
                .values(
                  newElements.map((el) => ({
                    projectId: access.project.id,
                    breakdownElementId: el.id,
                    name: el.name,
                  })),
                )
                .returning({
                  id: locationRequirements.id,
                  breakdownElementId: locationRequirements.breakdownElementId,
                }),
              (e) => new DbError("syncRequirements/insert", e),
            )
              .andThen((insertedReqs) => {
                // Populate location_requirement_scenes from breakdown occurrences:
                // every scene where the breakdown element appears is a candidate
                // scene for that requirement. Without this Cesare can't tell
                // which scenes a location belongs to.
                const elementIds = insertedReqs
                  .map((r) => r.breakdownElementId)
                  .filter((id): id is string => id !== null);
                if (elementIds.length === 0) {
                  return ResultAsync.fromSafePromise(Promise.resolve());
                }
                return ResultAsync.fromPromise(
                  db
                    .select({
                      elementId: breakdownOccurrences.elementId,
                      sceneId: breakdownOccurrences.sceneId,
                    })
                    .from(breakdownOccurrences)
                    .where(inArray(breakdownOccurrences.elementId, elementIds)),
                  (e) => new DbError("syncRequirements/loadOccurrences", e),
                ).andThen((occs) => {
                  const reqByElementId = new Map(
                    insertedReqs
                      .filter((r) => r.breakdownElementId)
                      .map((r) => [r.breakdownElementId as string, r.id]),
                  );
                  const links = occs
                    .filter((o) => o.sceneId !== null)
                    .map((o) => ({
                      requirementId: reqByElementId.get(o.elementId),
                      sceneId: o.sceneId as string,
                    }))
                    .filter(
                      (l): l is { requirementId: string; sceneId: string } =>
                        l.requirementId !== undefined,
                    );
                  if (links.length === 0) {
                    return ResultAsync.fromSafePromise(Promise.resolve());
                  }
                  return ResultAsync.fromPromise(
                    db
                      .insert(locationRequirementScenes)
                      .values(links)
                      .onConflictDoNothing(),
                    (e) => new DbError("syncRequirements/insertScenes", e),
                  ).map(() => undefined);
                });
              })
              .andThen(() =>
                // Best-effort: a failed Haiku normalisation must not break
                // sync — the requirements still load, chips just stay absent
                // until the next sync retries the null location_type rows.
                normaliseRequirements(db, access.project.id).orElse(() =>
                  okAsync(0),
                ),
              )
              .andThen(() => loadRequirementsForProject(db, access.project.id));
          });
        }),
      ),
    ),
  );

/**
 * Manually (re)normalise a project's requirements to canonical location types.
 * Only touches rows whose location_type is still null.
 */
export const normaliseProjectLocations = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
        normaliseRequirements(db, access.project.id),
      ),
    ),
  );

export const locationsQueryOptions = (projectId: string) => ({
  queryKey: ["locations", projectId],
  queryFn: () => getLocationRequirements({ data: { projectId } }),
});
