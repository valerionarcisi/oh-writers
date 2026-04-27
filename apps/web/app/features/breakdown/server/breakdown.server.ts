import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import {
  breakdownElements,
  breakdownOccurrences,
  breakdownSceneState,
  scenes,
} from "@oh-writers/db/schema";
import {
  BreakdownCategorySchema,
  BreakdownElementSchema,
  BreakdownOccurrenceSchema,
  CastTierSchema,
  CesareStatusSchema,
  type BreakdownElement,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  BreakdownElementNotFoundError,
  BreakdownSceneNotFoundError,
  DbError,
  ForbiddenError,
} from "../breakdown.errors";
import { hashText } from "@oh-writers/utils";
import { canEditBreakdown, canViewBreakdown } from "../lib/permissions";
import { findElementInText } from "../lib/re-match";
import {
  resolveBreakdownAccessByProjectId,
  resolveBreakdownAccessByScene,
} from "./breakdown-access";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sceneTextOf = (scene: {
  heading: string;
  notes: string | null;
}): string => scene.heading + "\n" + (scene.notes ?? "");

const parseElement = (row: typeof breakdownElements.$inferSelect) =>
  BreakdownElementSchema.parse({
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

const parseOccurrence = (row: typeof breakdownOccurrences.$inferSelect) =>
  BreakdownOccurrenceSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

// ─── getBreakdownForScene (with L1 re-match) ─────────────────────────────────

export interface SceneOccurrenceWithElement {
  occurrence: z.infer<typeof BreakdownOccurrenceSchema>;
  element: z.infer<typeof BreakdownElementSchema>;
}

const GetForSceneInput = z.object({
  sceneId: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
});

export const getBreakdownForScene = createServerFn({ method: "GET" })
  .validator(GetForSceneInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        SceneOccurrenceWithElement[],
        BreakdownSceneNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const sceneResult = await ResultAsync.fromPromise(
        db.query.scenes
          .findFirst({ where: eq(scenes.id, data.sceneId) })
          .then((r) => r ?? null),
        (e) => new DbError("getBreakdownForScene/loadScene", e),
      );
      if (sceneResult.isErr()) return toShape(err(sceneResult.error));
      const scene = sceneResult.value;
      if (!scene)
        return toShape(err(new BreakdownSceneNotFoundError(data.sceneId)));

      const accessResult = await resolveBreakdownAccessByScene(
        db,
        user.id,
        scene.id,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canViewBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("view breakdown")));

      const result = await ResultAsync.fromPromise(
        db
          .select({ occ: breakdownOccurrences, el: breakdownElements })
          .from(breakdownOccurrences)
          .innerJoin(
            breakdownElements,
            eq(breakdownOccurrences.elementId, breakdownElements.id),
          )
          .where(
            and(
              eq(breakdownOccurrences.sceneId, scene.id),
              eq(
                breakdownOccurrences.screenplayVersionId,
                data.screenplayVersionId,
              ),
              isNull(breakdownElements.archivedAt),
              ne(breakdownOccurrences.cesareStatus, "ignored"),
            ),
          ),
        (e) => new DbError("getBreakdownForScene/loadOccs", e),
      ).andThen((rows) => {
        const currentHash = hashText(sceneTextOf(scene));
        return ResultAsync.fromPromise(
          db.query.breakdownSceneState
            .findFirst({
              where: and(
                eq(breakdownSceneState.sceneId, scene.id),
                eq(
                  breakdownSceneState.screenplayVersionId,
                  data.screenplayVersionId,
                ),
              ),
            })
            .then((r) => r ?? null),
          (e) => new DbError("getBreakdownForScene/loadState", e),
        ).andThen((state) => {
          const needsRematch = !state || state.textHash !== currentHash;
          if (!needsRematch) return ok(rows);
          const sceneText = sceneTextOf(scene);
          return ResultAsync.fromPromise(
            (async () => {
              const updated: typeof rows = [];
              for (const r of rows) {
                const isStale = !findElementInText(r.el.name, sceneText);
                if (isStale !== r.occ.isStale) {
                  await db
                    .update(breakdownOccurrences)
                    .set({ isStale, updatedAt: new Date() })
                    .where(eq(breakdownOccurrences.id, r.occ.id));
                }
                updated.push({
                  occ: { ...r.occ, isStale },
                  el: r.el,
                });
              }
              await db
                .insert(breakdownSceneState)
                .values({
                  sceneId: scene.id,
                  screenplayVersionId: data.screenplayVersionId,
                  textHash: currentHash,
                })
                .onConflictDoUpdate({
                  target: [
                    breakdownSceneState.sceneId,
                    breakdownSceneState.screenplayVersionId,
                  ],
                  set: { textHash: currentHash },
                });
              return updated;
            })(),
            (e) => new DbError("getBreakdownForScene/rematchUpdate", e),
          );
        });
      });

      if (result.isErr()) return toShape(err(result.error));
      return toShape(
        ok(
          result.value.map((r) => ({
            occurrence: parseOccurrence(r.occ),
            element: parseElement(r.el),
          })),
        ),
      );
    },
  );

// ─── getProjectBreakdown (consolidated view) ─────────────────────────────────

export interface ProjectBreakdownRow {
  element: z.infer<typeof BreakdownElementSchema>;
  totalQuantity: number;
  scenesPresent: { sceneId: string; sceneNumber: number }[];
  hasStale: boolean;
}

export const getProjectBreakdownRows = (
  db: Db,
  projectId: string,
  screenplayVersionId: string,
): ResultAsync<ProjectBreakdownRow[], DbError> =>
  ResultAsync.fromPromise(
    db
      .select({
        el: breakdownElements,
        occ: breakdownOccurrences,
        scene: scenes,
      })
      .from(breakdownElements)
      .leftJoin(
        breakdownOccurrences,
        and(
          eq(breakdownOccurrences.elementId, breakdownElements.id),
          eq(breakdownOccurrences.screenplayVersionId, screenplayVersionId),
        ),
      )
      .leftJoin(scenes, eq(scenes.id, breakdownOccurrences.sceneId))
      .where(
        and(
          eq(breakdownElements.projectId, projectId),
          isNull(breakdownElements.archivedAt),
        ),
      ),
    (e) => new DbError("getProjectBreakdown", e),
  ).map((rows) => {
    type Agg = ProjectBreakdownRow & { _totalOccs: number };
    const byElement = new Map<string, Agg>();
    for (const r of rows) {
      const key = r.el.id;
      const isIgnored = r.occ?.cesareStatus === "ignored";
      const counts = r.occ && r.scene && !isIgnored;
      const existing = byElement.get(key);
      if (!existing) {
        byElement.set(key, {
          element: parseElement(r.el),
          totalQuantity: counts ? r.occ!.quantity : 0,
          scenesPresent: counts
            ? [{ sceneId: r.scene!.id, sceneNumber: r.scene!.number }]
            : [],
          hasStale: counts ? r.occ!.isStale : false,
          _totalOccs: r.occ ? 1 : 0,
        });
      } else {
        if (r.occ) existing._totalOccs += 1;
        if (counts) {
          existing.totalQuantity += r.occ!.quantity;
          existing.scenesPresent.push({
            sceneId: r.scene!.id,
            sceneNumber: r.scene!.number,
          });
          if (r.occ!.isStale) existing.hasStale = true;
        }
      }
    }
    return [...byElement.values()]
      .filter((row) => row._totalOccs === 0 || row.scenesPresent.length > 0)
      .map(({ _totalOccs: _omit, ...r }) => r);
  });

export const getProjectBreakdown = createServerFn({ method: "GET" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      screenplayVersionId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<ProjectBreakdownRow[], ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const accessResult = await resolveBreakdownAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canViewBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("view breakdown")));

      return toShape(
        await getProjectBreakdownRows(
          db,
          data.projectId,
          data.screenplayVersionId,
        ),
      );
    },
  );

// ─── getStaleScenes ──────────────────────────────────────────────────────────

export const getStaleScenes = createServerFn({ method: "GET" })
  .validator(z.object({ screenplayVersionId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ResultShape<string[], DbError>> => {
    await requireUser();
    const db = await getDb();
    const result = await ResultAsync.fromPromise(
      db
        .selectDistinct({ sceneId: breakdownOccurrences.sceneId })
        .from(breakdownOccurrences)
        .where(
          and(
            eq(
              breakdownOccurrences.screenplayVersionId,
              data.screenplayVersionId,
            ),
            eq(breakdownOccurrences.isStale, true),
          ),
        ),
      (e) => new DbError("getStaleScenes", e),
    ).map((rows) => rows.map((r) => r.sceneId));
    return toShape(result);
  });

// ─── addBreakdownElement (manual add + optional occurrence) ──────────────────

const AddElementInputSchema = z
  .object({
    projectId: z.string().uuid(),
    category: BreakdownCategorySchema,
    name: z.string().min(1).max(200),
    description: z.string().nullable().optional(),
    castTier: CastTierSchema.nullable().optional(),
    occurrence: z
      .object({
        sceneId: z.string().uuid(),
        screenplayVersionId: z.string().uuid(),
        quantity: z.number().int().positive().default(1),
        note: z.string().nullable().optional(),
      })
      .optional(),
  })
  .refine((input) => input.castTier == null || input.category === "cast", {
    message: "castTier può essere impostato solo su elementi di categoria cast",
    path: ["castTier"],
  });

export const addBreakdownElement = createServerFn({ method: "POST" })
  .validator(AddElementInputSchema)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { elementId: string; occurrenceId: string | null },
        ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();
      const accessResult = await resolveBreakdownAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canEditBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("add breakdown element")));

      const result = await ResultAsync.fromPromise(
        db
          .insert(breakdownElements)
          .values({
            projectId: data.projectId,
            category: data.category,
            name: data.name,
            description: data.description ?? null,
            castTier: data.castTier ?? null,
          })
          .onConflictDoUpdate({
            target: [
              breakdownElements.projectId,
              breakdownElements.category,
              breakdownElements.name,
            ],
            set: {
              updatedAt: new Date(),
              archivedAt: null,
              ...(data.castTier !== undefined && { castTier: data.castTier }),
            },
          })
          .returning(),
        (e) => new DbError("addBreakdownElement/upsert", e),
      ).andThen(([elRow]) => {
        if (!elRow)
          return err(
            new DbError("addBreakdownElement/upsert", "no row returned"),
          );
        if (!data.occurrence)
          return ok({
            elementId: elRow.id,
            occurrenceId: null as string | null,
          });
        const occInput = data.occurrence;
        return ResultAsync.fromPromise(
          db
            .insert(breakdownOccurrences)
            .values({
              elementId: elRow.id,
              sceneId: occInput.sceneId,
              screenplayVersionId: occInput.screenplayVersionId,
              quantity: occInput.quantity,
              note: occInput.note ?? null,
              cesareStatus: "accepted",
            })
            .onConflictDoUpdate({
              target: [
                breakdownOccurrences.elementId,
                breakdownOccurrences.screenplayVersionId,
                breakdownOccurrences.sceneId,
              ],
              set: {
                quantity: occInput.quantity,
                note: occInput.note ?? null,
                updatedAt: new Date(),
              },
            })
            .returning(),
          (e) => new DbError("addBreakdownElement/insertOcc", e),
        ).andThen(([occRow]) =>
          occRow
            ? ok({
                elementId: elRow.id,
                occurrenceId: occRow.id as string | null,
              })
            : err(
                new DbError("addBreakdownElement/insertOcc", "no row returned"),
              ),
        );
      });

      return toShape(result);
    },
  );

// ─── updateBreakdownElement + archiveBreakdownElement ────────────────────────

export const updateBreakdownElement = createServerFn({ method: "POST" })
  .validator(
    z.object({
      elementId: z.string().uuid(),
      patch: z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().nullable().optional(),
        castTier: CastTierSchema.nullable().optional(),
      }),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BreakdownElement,
        BreakdownElementNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const elResult = await ResultAsync.fromPromise(
        db.query.breakdownElements
          .findFirst({ where: eq(breakdownElements.id, data.elementId) })
          .then((r) => r ?? null),
        (e) => new DbError("updateBreakdownElement/load", e),
      );
      if (elResult.isErr()) return toShape(err(elResult.error));
      const el = elResult.value;
      if (!el)
        return toShape(err(new BreakdownElementNotFoundError(data.elementId)));

      const accessResult = await resolveBreakdownAccessByProjectId(
        db,
        user.id,
        el.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canEditBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("update breakdown element")));

      const result = await ResultAsync.fromPromise(
        db
          .update(breakdownElements)
          .set({
            ...(data.patch.name !== undefined && { name: data.patch.name }),
            ...(data.patch.description !== undefined && {
              description: data.patch.description,
            }),
            ...(data.patch.castTier !== undefined && {
              castTier: data.patch.castTier,
            }),
            updatedAt: new Date(),
          })
          .where(eq(breakdownElements.id, el.id))
          .returning(),
        (e) => new DbError("updateBreakdownElement/update", e),
      ).andThen(([row]) =>
        row
          ? ok(parseElement(row))
          : err(
              new DbError("updateBreakdownElement/update", "no row returned"),
            ),
      );

      return toShape(result);
    },
  );

export const archiveBreakdownElement = createServerFn({ method: "POST" })
  .validator(z.object({ elementId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { ok: true },
        BreakdownElementNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const elResult = await ResultAsync.fromPromise(
        db.query.breakdownElements
          .findFirst({ where: eq(breakdownElements.id, data.elementId) })
          .then((r) => r ?? null),
        (e) => new DbError("archiveBreakdownElement/load", e),
      );
      if (elResult.isErr()) return toShape(err(elResult.error));
      const el = elResult.value;
      if (!el)
        return toShape(err(new BreakdownElementNotFoundError(data.elementId)));

      const accessResult = await resolveBreakdownAccessByProjectId(
        db,
        user.id,
        el.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canEditBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("archive breakdown element")));

      const result = await ResultAsync.fromPromise(
        db
          .update(breakdownElements)
          .set({ archivedAt: new Date() })
          .where(eq(breakdownElements.id, el.id)),
        (e) => new DbError("archiveBreakdownElement/update", e),
      ).map(() => ({ ok: true as const }));
      return toShape(result);
    },
  );

// ─── setOccurrenceStatus (single + bulk) ─────────────────────────────────────

const SetStatusInputSchema = z.object({
  occurrenceIds: z.array(z.string().uuid()).min(1),
  status: CesareStatusSchema,
});

export const setOccurrenceStatus = createServerFn({ method: "POST" })
  .validator(SetStatusInputSchema)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ updated: number }, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const rowsResult = await ResultAsync.fromPromise(
        db
          .select({
            projectId: breakdownElements.projectId,
            occId: breakdownOccurrences.id,
          })
          .from(breakdownOccurrences)
          .innerJoin(
            breakdownElements,
            eq(breakdownOccurrences.elementId, breakdownElements.id),
          )
          .where(inArray(breakdownOccurrences.id, data.occurrenceIds)),
        (e) => new DbError("setOccurrenceStatus/load", e),
      );
      if (rowsResult.isErr()) return toShape(err(rowsResult.error));
      const rows = rowsResult.value;
      if (rows.length === 0) return toShape(ok({ updated: 0 }));

      const projectIds = [...new Set(rows.map((r) => r.projectId))];
      for (const pid of projectIds) {
        const accessResult = await resolveBreakdownAccessByProjectId(
          db,
          user.id,
          pid,
        );
        if (accessResult.isErr()) return toShape(err(accessResult.error));
        if (!canEditBreakdown(accessResult.value))
          return toShape(err(new ForbiddenError("update occurrence status")));
      }

      const updated = await ResultAsync.fromPromise(
        db
          .update(breakdownOccurrences)
          .set({ cesareStatus: data.status, updatedAt: new Date() })
          .where(
            inArray(
              breakdownOccurrences.id,
              rows.map((r) => r.occId),
            ),
          ),
        (e) => new DbError("setOccurrenceStatus/update", e),
      ).map(() => ({ updated: rows.length }));

      return toShape(updated);
    },
  );

// ─── listScenesForBreakdown — minimal scene list for the TOC + script panes ──

export interface BreakdownSceneSummary {
  id: string;
  number: number;
  heading: string;
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: string | null;
  notes: string | null;
}

export interface BreakdownContext {
  projectId: string;
  screenplayVersionId: string;
  versionContent: string; // fountain snapshot della version corrente; "" se nessuna version
  scenes: BreakdownSceneSummary[];
  canEdit: boolean;
}

export const getBreakdownContext = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<BreakdownContext, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();
      const accessResult = await resolveBreakdownAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canViewBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("view breakdown")));

      const canEdit = canEditBreakdown(accessResult.value);
      const result = await ResultAsync.fromPromise(
        (async () => {
          const screenplay = await db.query.screenplays.findFirst({
            where: (s, { eq: e }) => e(s.projectId, data.projectId),
          });
          if (!screenplay || !screenplay.currentVersionId) {
            return {
              projectId: data.projectId,
              screenplayVersionId: "",
              versionContent: "",
              scenes: [] as BreakdownSceneSummary[],
              canEdit,
            };
          }
          const [version, sceneRows] = await Promise.all([
            db.query.screenplayVersions.findFirst({
              where: (v, { eq: e }) => e(v.id, screenplay.currentVersionId!),
            }),
            db.query.scenes.findMany({
              where: (sc, { eq: e }) => e(sc.screenplayId, screenplay.id),
              orderBy: (sc, { asc }) => [asc(sc.number)],
            }),
          ]);
          return {
            projectId: data.projectId,
            screenplayVersionId: screenplay.currentVersionId,
            versionContent: version?.content ?? "",
            scenes: sceneRows.map((s) => ({
              id: s.id,
              number: s.number,
              heading: s.heading,
              intExt: s.intExt,
              location: s.location,
              timeOfDay: s.timeOfDay,
              notes: s.notes,
            })),
            canEdit,
          };
        })(),
        (e) => new DbError("getBreakdownContext", e),
      );
      return toShape(result);
    },
  );
