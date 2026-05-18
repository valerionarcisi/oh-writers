import { eq, inArray } from "drizzle-orm";
import { ResultAsync, ok } from "neverthrow";
import {
  locationRequirements,
  locationCandidates,
  locationRequirementScenes,
  locationPhotos,
} from "@oh-writers/db/schema";
import {
  LocationRequirementSchema,
  LocationCandidateSchema,
  type LocationRequirement,
  type LocationCandidate,
} from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { DbError } from "../locations.errors";

const parseCandidate = (
  row: typeof locationCandidates.$inferSelect,
  photos: typeof locationPhotos.$inferSelect[],
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

export const loadRequirementsForProject = (
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
