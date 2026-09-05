import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { ResultAsync, ok, err, okAsync, errAsync } from "neverthrow";
import {
  breakdownElements,
  breakdownOccurrences,
  breakdownSceneState,
  scenes,
  screenplays,
  screenplayVersions,
} from "@oh-writers/db/schema";
import {
  ensureFirstVersion,
  syncScenesFromFountain,
} from "~/features/screenplay-editor";
import {
  BreakdownCategorySchema,
  BreakdownElementSchema,
  BreakdownOccurrenceSchema,
  CastTierSchema,
  CesareStatusSchema,
  listScenesInFountain,
  type BreakdownElement,
  type OccurrenceSource,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { withProjectAccess } from "~/server/pipeline";
import { requireProjectAccess } from "~/server/access";
import { ProjectNotFoundError } from "~/features/projects";
import {
  BreakdownElementNotFoundError,
  BreakdownSceneNotFoundError,
  DbError,
  ForbiddenError,
} from "../breakdown.errors";
import { hashText } from "@oh-writers/utils/hash";
import { findElementInText } from "../lib/re-match";

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

// ─── Loader helpers (Spec 23 — ResultAsync, not Promise<T | null>) ───────────

const findSceneById = (
  db: Db,
  sceneId: string,
): ResultAsync<
  typeof scenes.$inferSelect,
  BreakdownSceneNotFoundError | DbError
> =>
  ResultAsync.fromPromise(
    db.query.scenes.findFirst({ where: eq(scenes.id, sceneId) }),
    (e) => new DbError("findSceneById", e),
  ).andThen((row) =>
    row ? ok(row) : err(new BreakdownSceneNotFoundError(sceneId)),
  );

const findScreenplayById = (
  db: Db,
  screenplayId: string,
): ResultAsync<typeof screenplays.$inferSelect, DbError> =>
  ResultAsync.fromPromise(
    db.query.screenplays.findFirst({ where: eq(screenplays.id, screenplayId) }),
    (e) => new DbError("findScreenplayById", e),
  ).andThen((row) =>
    row
      ? ok(row)
      : err(new DbError("findScreenplayById", `not found: ${screenplayId}`)),
  );

const findBreakdownElementById = (
  db: Db,
  elementId: string,
): ResultAsync<
  typeof breakdownElements.$inferSelect,
  BreakdownElementNotFoundError | DbError
> =>
  ResultAsync.fromPromise(
    db.query.breakdownElements.findFirst({
      where: eq(breakdownElements.id, elementId),
    }),
    (e) => new DbError("findBreakdownElementById", e),
  ).andThen((row) =>
    row ? ok(row) : err(new BreakdownElementNotFoundError(elementId)),
  );

// ─── getBreakdownForScene (with L1 re-match) ─────────────────────────────────

export interface SceneOccurrenceWithElement {
  occurrence: z.infer<typeof BreakdownOccurrenceSchema>;
  element: z.infer<typeof BreakdownElementSchema>;
}

const GetForSceneInput = z.object({
  sceneId: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
});

const loadSceneOccurrencesWithRematch = (
  db: Db,
  scene: typeof scenes.$inferSelect,
  screenplayVersionId: string,
): ResultAsync<SceneOccurrenceWithElement[], DbError> =>
  ResultAsync.fromPromise(
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
          eq(breakdownOccurrences.screenplayVersionId, screenplayVersionId),
          isNull(breakdownElements.archivedAt),
          ne(breakdownOccurrences.cesareStatus, "ignored"),
        ),
      ),
    (e) => new DbError("getBreakdownForScene/loadOccs", e),
  ).andThen((rows) => {
    const currentHash = hashText(sceneTextOf(scene));
    return ResultAsync.fromPromise(
      db.query.breakdownSceneState.findFirst({
        where: and(
          eq(breakdownSceneState.sceneId, scene.id),
          eq(breakdownSceneState.screenplayVersionId, screenplayVersionId),
        ),
      }),
      (e) => new DbError("getBreakdownForScene/loadState", e),
    ).andThen((state) => {
      const needsRematch = !state || state.textHash !== currentHash;
      if (!needsRematch)
        return okAsync(
          rows.map((r) => ({
            occurrence: parseOccurrence(r.occ),
            element: parseElement(r.el),
          })),
        );
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
            updated.push({ occ: { ...r.occ, isStale }, el: r.el });
          }
          await db
            .insert(breakdownSceneState)
            .values({
              sceneId: scene.id,
              screenplayVersionId,
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
      ).map((updated) =>
        updated.map((r) => ({
          occurrence: parseOccurrence(r.occ),
          element: parseElement(r.el),
        })),
      );
    });
  });

export const getBreakdownForScene = createServerFn({ method: "GET" })
  .validator(GetForSceneInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        SceneOccurrenceWithElement[],
        | BreakdownSceneNotFoundError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findSceneById(db, data.sceneId).andThen((scene) =>
            findScreenplayById(db, scene.screenplayId).andThen((screenplay) =>
              requireProjectAccess(db, screenplay.projectId, "view").andThen(
                () =>
                  loadSceneOccurrencesWithRematch(
                    db,
                    scene,
                    data.screenplayVersionId,
                  ),
              ),
            ),
          ),
        ),
      ),
  );

// ─── getProjectBreakdown (consolidated view) ─────────────────────────────────

export interface ProjectBreakdownRow {
  element: z.infer<typeof BreakdownElementSchema>;
  totalQuantity: number;
  scenesPresent: {
    sceneId: string;
    sceneNumber: number;
    quantity: number;
    occurrenceId: string;
  }[];
  hasStale: boolean;
  hasPending: boolean;
  latestSource: OccurrenceSource | null;
  /** Spec 89 — true if ANY occurrence in this element's history was ever
   *  Cesare-sourced, even if a later occurrence corrected it manually. Unlike
   *  `latestSource`, this never flips back to false. */
  everAiTouched: boolean;
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
    type Agg = ProjectBreakdownRow & {
      _totalOccs: number;
      _latestOccAt: Date | null;
    };
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
            ? [
                {
                  sceneId: r.scene!.id,
                  sceneNumber: r.scene!.number,
                  quantity: r.occ!.quantity,
                  occurrenceId: r.occ!.id,
                },
              ]
            : [],
          hasStale: counts ? r.occ!.isStale : false,
          hasPending: counts ? r.occ!.cesareStatus === "pending" : false,
          latestSource: r.occ
            ? (r.occ.source as OccurrenceSource | null)
            : null,
          everAiTouched: r.el.everAiTouched,
          _totalOccs: r.occ ? 1 : 0,
          _latestOccAt: r.occ ? r.occ.createdAt : null,
        });
      } else {
        if (r.occ) {
          existing._totalOccs += 1;
          if (
            r.occ.createdAt &&
            (!existing._latestOccAt || r.occ.createdAt > existing._latestOccAt)
          ) {
            existing._latestOccAt = r.occ.createdAt;
            existing.latestSource = r.occ.source as OccurrenceSource | null;
          }
        }
        if (counts) {
          existing.totalQuantity += r.occ!.quantity;
          existing.scenesPresent.push({
            sceneId: r.scene!.id,
            sceneNumber: r.scene!.number,
            quantity: r.occ!.quantity,
            occurrenceId: r.occ!.id,
          });
          if (r.occ!.isStale) existing.hasStale = true;
          if (r.occ!.cesareStatus === "pending") existing.hasPending = true;
        }
      }
    }
    return [...byElement.values()]
      .filter((row) => row._totalOccs === 0 || row.scenesPresent.length > 0)
      .map(({ _totalOccs: _omit, _latestOccAt: _omit2, ...r }) => r);
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
      ResultShape<
        ProjectBreakdownRow[],
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          getProjectBreakdownRows(
            db,
            access.project.id,
            data.screenplayVersionId,
          ),
        ),
      ),
  );

// ─── getStaleScenes ──────────────────────────────────────────────────────────

export const getStaleScenes = createServerFn({ method: "GET" })
  .validator(z.object({ screenplayVersionId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<string[], ProjectNotFoundError | ForbiddenError | DbError>
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          ResultAsync.fromPromise(
            db.query.screenplayVersions.findFirst({
              where: eq(screenplayVersions.id, data.screenplayVersionId),
            }),
            (e) => new DbError("getStaleScenes/loadVersion", e),
          )
            .andThen((version) =>
              version
                ? okAsync(version)
                : errAsync(
                    new DbError(
                      "getStaleScenes",
                      `version not found: ${data.screenplayVersionId}`,
                    ),
                  ),
            )
            .andThen((version) =>
              findScreenplayById(db, version.screenplayId).andThen(
                (screenplay) =>
                  requireProjectAccess(
                    db,
                    screenplay.projectId,
                    "view",
                  ).andThen(() =>
                    ResultAsync.fromPromise(
                      db
                        .selectDistinct({
                          sceneId: breakdownOccurrences.sceneId,
                        })
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
                    ).map((rows) => rows.map((r) => r.sceneId)),
                  ),
              ),
            ),
        ),
      ),
  );

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
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db }) =>
          ResultAsync.fromPromise(
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
                  ...(data.castTier !== undefined && {
                    castTier: data.castTier,
                  }),
                },
              })
              .returning(),
            (e) => new DbError("addBreakdownElement/upsert", e),
          ).andThen(([elRow]) => {
            if (!elRow)
              return errAsync(
                new DbError("addBreakdownElement/upsert", "no row returned"),
              );
            if (!data.occurrence)
              return okAsync({
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
                    new DbError(
                      "addBreakdownElement/insertOcc",
                      "no row returned",
                    ),
                  ),
            );
          }),
        ),
      ),
  );

// ─── updateBreakdownElement + archiveBreakdownElement ────────────────────────

export const updateBreakdownElement = createServerFn({ method: "POST" })
  .validator(
    z.object({
      elementId: z.string().uuid(),
      patch: z.object({
        name: z.string().min(1).max(200).optional(),
        category: BreakdownCategorySchema.optional(),
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
        | BreakdownElementNotFoundError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBreakdownElementById(db, data.elementId).andThen((el) =>
            requireProjectAccess(db, el.projectId, "edit").andThen(() =>
              ResultAsync.fromPromise(
                db
                  .update(breakdownElements)
                  .set({
                    ...(data.patch.name !== undefined && {
                      name: data.patch.name,
                    }),
                    ...(data.patch.category !== undefined && {
                      category: data.patch.category,
                    }),
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
                      new DbError(
                        "updateBreakdownElement/update",
                        "no row returned",
                      ),
                    ),
              ),
            ),
          ),
        ),
      ),
  );

export const archiveBreakdownElement = createServerFn({ method: "POST" })
  .validator(z.object({ elementId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { ok: true },
        | BreakdownElementNotFoundError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBreakdownElementById(db, data.elementId).andThen((el) =>
            requireProjectAccess(db, el.projectId, "edit").andThen(() =>
              ResultAsync.fromPromise(
                db
                  .update(breakdownElements)
                  .set({ archivedAt: new Date() })
                  .where(eq(breakdownElements.id, el.id)),
                (e) => new DbError("archiveBreakdownElement/update", e),
              ).map(() => ({ ok: true as const })),
            ),
          ),
        ),
      ),
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
    }): Promise<
      ResultShape<
        { updated: number },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          ResultAsync.fromPromise(
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
          ).andThen((rows) => {
            if (rows.length === 0) return okAsync({ updated: 0 });
            const projectIds = [...new Set(rows.map((r) => r.projectId))];
            // Sequentially gate each unique project on edit access. Using
            // `.andThen` chained over the list keeps short-circuit semantics.
            const gateAll = projectIds.reduce<
              ResultAsync<true, ProjectNotFoundError | ForbiddenError | DbError>
            >(
              (acc, pid) =>
                acc.andThen(() =>
                  requireProjectAccess(db, pid, "edit").map(
                    () => true as const,
                  ),
                ),
              okAsync(true as const),
            );
            return gateAll.andThen(() =>
              ResultAsync.fromPromise(
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
              ).map(() => ({ updated: rows.length })),
            );
          }),
        ),
      ),
  );

// ─── listScenesForBreakdown — minimal scene list for the TOC + script panes ──

export interface BreakdownSceneSummary {
  id: string;
  number: number;
  /** Explicit fountain scene number (from `#N#` marker, e.g. "2A"), or the ordinal as a string. */
  fountainNumber: string;
  heading: string;
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: string | null;
  notes: string | null;
}

export interface BreakdownContext {
  projectId: string;
  /** Id dello screenplay del progetto. Vuoto solo se il progetto non ne ha
   *  ancora uno — caso bordo che fa fallire le viste anyway. */
  screenplayId: string;
  screenplayVersionId: string;
  versionContent: string; // fountain snapshot della version corrente; "" se nessuna version
  scenes: BreakdownSceneSummary[];
  canEdit: boolean;
}

const buildBreakdownContext = (
  db: Db,
  projectId: string,
  userId: string,
  canEdit: boolean,
): ResultAsync<BreakdownContext, DbError> =>
  ResultAsync.fromPromise(
    (async () => {
      const screenplay = await db.query.screenplays.findFirst({
        where: (s, { eq: e }) => e(s.projectId, projectId),
      });
      if (!screenplay) {
        return {
          projectId,
          screenplayId: "",
          screenplayVersionId: "",
          versionContent: "",
          scenes: [] as BreakdownSceneSummary[],
          canEdit,
        };
      }
      // Lazy-create v1 if the screenplay row exists but no version was
      // ever pointed to. This recovers projects whose import path created
      // the screenplay but never triggered saveScreenplay (which is what
      // normally calls ensureFirstVersion + updates currentVersionId).
      // Without this, the breakdown gets stuck on "Nessuna versione".
      let currentVersionId = screenplay.currentVersionId;
      if (!currentVersionId) {
        await ensureFirstVersion(db, screenplay.id, userId);
        const refreshed = await db.query.screenplays.findFirst({
          where: (s, { eq: e }) => e(s.id, screenplay.id),
        });
        if (refreshed?.currentVersionId) {
          currentVersionId = refreshed.currentVersionId;
        } else {
          const v = await db.query.screenplayVersions.findFirst({
            where: (v, { eq: e }) => e(v.screenplayId, screenplay.id),
            orderBy: (v, { asc }) => [asc(v.number)],
          });
          if (v) {
            await db
              .update(screenplays)
              .set({ currentVersionId: v.id })
              .where(eq(screenplays.id, screenplay.id));
            currentVersionId = v.id;
          }
        }
      }
      if (!currentVersionId) {
        return {
          projectId,
          screenplayId: screenplay.id,
          screenplayVersionId: "",
          versionContent: "",
          scenes: [] as BreakdownSceneSummary[],
          canEdit,
        };
      }
      let version = await db.query.screenplayVersions.findFirst({
        where: (v, { eq: e }) => e(v.id, currentVersionId),
      });

      // Heal stale data: if v1 was snapshotted while screenplays.content
      // was still empty (race between import-create and import-save) but
      // screenplays.content has since been written, copy it forward so
      // the breakdown viewer and auto-spoglio see the same fountain.
      if (
        version &&
        version.content.length === 0 &&
        screenplay.content.length > 0
      ) {
        await db
          .update(screenplayVersions)
          .set({ content: screenplay.content })
          .where(eq(screenplayVersions.id, version.id));
        version = { ...version, content: screenplay.content };
      }

      // One-shot backfill for screenplays imported before saveScreenplay
      // started mirroring fountain into the scenes table. If we have
      // version content but zero scenes, parse + insert once. New saves
      // already keep this in sync via syncScenesFromFountain.
      let sceneRows = await db.query.scenes.findMany({
        where: (sc, { eq: e }) => e(sc.screenplayId, screenplay.id),
        orderBy: (sc, { asc }) => [asc(sc.number)],
      });
      if (sceneRows.length === 0 && version?.content) {
        await syncScenesFromFountain(db, screenplay.id, version.content);
        sceneRows = await db.query.scenes.findMany({
          where: (sc, { eq: e }) => e(sc.screenplayId, screenplay.id),
          orderBy: (sc, { asc }) => [asc(sc.number)],
        });
      }
      const fountainContent = version?.content ?? "";
      const fountainScenes = fountainContent
        ? listScenesInFountain(fountainContent)
        : [];
      // Map ordinal index → explicit fountain number (e.g. "2A" from #2A#)
      const fountainNumberByOrdinal = new Map<number, string>(
        fountainScenes.map((fs) => [fs.index, fs.number]),
      );
      return {
        projectId,
        screenplayId: screenplay.id,
        screenplayVersionId: currentVersionId,
        versionContent: fountainContent,
        scenes: sceneRows.map((s) => ({
          id: s.id,
          number: s.number,
          fountainNumber:
            fountainNumberByOrdinal.get(s.number) ?? String(s.number),
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

export const getBreakdownContext = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BreakdownContext,
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) => {
          const canEdit =
            access.isPersonalOwner ||
            access.role === "owner" ||
            access.role === "editor";
          return buildBreakdownContext(
            db,
            access.project.id,
            access.user.id,
            canEdit,
          );
        }),
      ),
  );

// ─── bulkUpdateBreakdownElements ──────────────────────────────────────────────

export const bulkUpdateBreakdownElements = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      elementIds: z.array(z.string().uuid()).min(1).max(200),
      patch: z.object({
        category: BreakdownCategorySchema.optional(),
        archivedAt: z.union([z.literal("now"), z.null()]).optional(),
      }),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { updated: number },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) => {
          const set: Partial<typeof breakdownElements.$inferInsert> = {
            updatedAt: new Date(),
          };
          if (data.patch.category !== undefined)
            set.category = data.patch.category;
          if (data.patch.archivedAt !== undefined)
            set.archivedAt =
              data.patch.archivedAt === "now" ? new Date() : null;
          return ResultAsync.fromPromise(
            db
              .update(breakdownElements)
              .set(set)
              .where(
                and(
                  eq(breakdownElements.projectId, access.project.id),
                  inArray(breakdownElements.id, data.elementIds),
                ),
              )
              .returning({ id: breakdownElements.id }),
            (e) => new DbError("bulkUpdateBreakdownElements", e),
          ).map((rows) => ({ updated: rows.length }));
        }),
      ),
  );

// ─── addBreakdownOccurrence ────────────────────────────────────────────────────

export const addBreakdownOccurrence = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      elementId: z.string().uuid(),
      sceneId: z.string().uuid(),
      screenplayVersionId: z.string().uuid(),
      quantity: z.number().int().min(1).max(9999).default(1),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { id: string; quantity: number },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
          // Verify elementId belongs to the project before inserting to
          // prevent IDOR.
          ResultAsync.fromPromise(
            db.query.breakdownElements.findFirst({
              where: and(
                eq(breakdownElements.id, data.elementId),
                eq(breakdownElements.projectId, access.project.id),
              ),
            }),
            (e) => new DbError("addBreakdownOccurrence/verify-element", e),
          )
            .andThen((el) =>
              el
                ? okAsync(el)
                : errAsync(new ForbiddenError("add breakdown occurrence")),
            )
            .andThen(() =>
              ResultAsync.fromPromise(
                db
                  .insert(breakdownOccurrences)
                  .values({
                    elementId: data.elementId,
                    screenplayVersionId: data.screenplayVersionId,
                    sceneId: data.sceneId,
                    quantity: data.quantity,
                    cesareStatus: "accepted",
                  })
                  .onConflictDoUpdate({
                    target: [
                      breakdownOccurrences.elementId,
                      breakdownOccurrences.screenplayVersionId,
                      breakdownOccurrences.sceneId,
                    ],
                    set: {
                      quantity: sql`excluded.quantity`,
                      updatedAt: new Date(),
                    },
                  })
                  .returning({
                    id: breakdownOccurrences.id,
                    quantity: breakdownOccurrences.quantity,
                  }),
                (e) => new DbError("addBreakdownOccurrence", e),
              ).andThen(([row]) =>
                row
                  ? ok(row)
                  : err(new DbError("addBreakdownOccurrence", "no row")),
              ),
            ),
        ),
      ),
  );

// ─── removeBreakdownOccurrence ─────────────────────────────────────────────────

export const removeBreakdownOccurrence = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      occurrenceId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<{ ok: true }, ProjectNotFoundError | ForbiddenError | DbError>
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
          // Gate delete on project ownership via the element join to
          // prevent IDOR.
          ResultAsync.fromPromise(
            db
              .delete(breakdownOccurrences)
              .where(
                and(
                  eq(breakdownOccurrences.id, data.occurrenceId),
                  inArray(
                    breakdownOccurrences.elementId,
                    db
                      .select({ id: breakdownElements.id })
                      .from(breakdownElements)
                      .where(
                        eq(breakdownElements.projectId, access.project.id),
                      ),
                  ),
                ),
              ),
            (e) => new DbError("removeBreakdownOccurrence", e),
          ).map(() => ({ ok: true as const })),
        ),
      ),
  );

// ─── mergeBreakdownElements ──────────────────────────────────────────────────
// Move all occurrences from `mergeIds` onto `keepId`, then archive the merged
// elements. Used by the "Unifica" bulk action on the Per Progetto view to
// consolidate near-duplicate variants (case, plural, levenshtein neighbours).
// All inputs must belong to the same project; the helper verifies this before
// touching any rows to prevent IDOR across projects.

const MergeElementsInput = z
  .object({
    projectId: z.string().uuid(),
    keepId: z.string().uuid(),
    mergeIds: z.array(z.string().uuid()).min(1).max(50),
  })
  .refine((d) => !d.mergeIds.includes(d.keepId), {
    message: "keepId must not appear in mergeIds",
    path: ["mergeIds"],
  });

export const mergeBreakdownElements = createServerFn({ method: "POST" })
  .validator(MergeElementsInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { merged: number; movedOccurrences: number },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) => {
          const allIds = [data.keepId, ...data.mergeIds];
          return ResultAsync.fromPromise(
            db
              .select({
                id: breakdownElements.id,
                projectId: breakdownElements.projectId,
              })
              .from(breakdownElements)
              .where(inArray(breakdownElements.id, allIds)),
            (e) => new DbError("mergeBreakdownElements/load", e),
          ).andThen((rows) => {
            const allBelong =
              rows.length === allIds.length &&
              rows.every((r) => r.projectId === access.project.id);
            if (!allBelong)
              return errAsync(
                new ForbiddenError("merge breakdown elements across projects"),
              );
            return ResultAsync.fromPromise(
              (async () => {
                // Move occurrences. The unique constraint
                // (element, version, scene) means we cannot blindly UPDATE —
                // if `keepId` already has an occurrence in the same
                // (version, scene), we sum quantities and delete the source.
                const sourceOccs = await db
                  .select()
                  .from(breakdownOccurrences)
                  .where(
                    inArray(breakdownOccurrences.elementId, data.mergeIds),
                  );
                let movedOccurrences = 0;
                for (const occ of sourceOccs) {
                  const existing =
                    await db.query.breakdownOccurrences.findFirst({
                      where: and(
                        eq(breakdownOccurrences.elementId, data.keepId),
                        eq(
                          breakdownOccurrences.screenplayVersionId,
                          occ.screenplayVersionId,
                        ),
                        eq(breakdownOccurrences.sceneId, occ.sceneId),
                      ),
                    });
                  if (existing) {
                    await db
                      .update(breakdownOccurrences)
                      .set({
                        quantity: existing.quantity + occ.quantity,
                        updatedAt: new Date(),
                      })
                      .where(eq(breakdownOccurrences.id, existing.id));
                    await db
                      .delete(breakdownOccurrences)
                      .where(eq(breakdownOccurrences.id, occ.id));
                  } else {
                    await db
                      .update(breakdownOccurrences)
                      .set({ elementId: data.keepId, updatedAt: new Date() })
                      .where(eq(breakdownOccurrences.id, occ.id));
                  }
                  movedOccurrences += 1;
                }
                await db
                  .update(breakdownElements)
                  .set({ archivedAt: new Date(), updatedAt: new Date() })
                  .where(inArray(breakdownElements.id, data.mergeIds));
                return { merged: data.mergeIds.length, movedOccurrences };
              })(),
              (e) => new DbError("mergeBreakdownElements/apply", e),
            );
          });
        }),
      ),
  );

// ─── bulkRenameBreakdownElements ─────────────────────────────────────────────
// Apply the same name to every selected element. The unique
// `(project, category, name)` constraint makes this most useful after a merge
// (where collisions have been removed) or for a single id.

const BulkRenameInput = z.object({
  projectId: z.string().uuid(),
  elementIds: z.array(z.string().uuid()).min(1).max(50),
  name: z.string().min(1).max(200),
});

export const bulkRenameBreakdownElements = createServerFn({ method: "POST" })
  .validator(BulkRenameInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { updated: number },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
          ResultAsync.fromPromise(
            db
              .update(breakdownElements)
              .set({ name: data.name, updatedAt: new Date() })
              .where(
                and(
                  eq(breakdownElements.projectId, access.project.id),
                  inArray(breakdownElements.id, data.elementIds),
                ),
              )
              .returning({ id: breakdownElements.id }),
            (e) => new DbError("bulkRenameBreakdownElements", e),
          ).map((rows) => ({ updated: rows.length })),
        ),
      ),
  );

// ─── bulkSetOccurrenceStatusForElements ──────────────────────────────────────
// "Conferma N" bulk action — given a set of element ids and a target status,
// flips every non-ignored occurrence of those elements (within a given
// version) to that status. We resolve element → occurrences server-side so
// the client doesn't need to fan out a request per occurrence.

const BulkSetStatusForElementsInput = z.object({
  projectId: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
  elementIds: z.array(z.string().uuid()).min(1).max(200),
  status: CesareStatusSchema,
});

export const bulkSetOccurrenceStatusForElements = createServerFn({
  method: "POST",
})
  .validator(BulkSetStatusForElementsInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { updated: number },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) =>
          ResultAsync.fromPromise(
            db
              .update(breakdownOccurrences)
              .set({ cesareStatus: data.status, updatedAt: new Date() })
              .where(
                and(
                  eq(
                    breakdownOccurrences.screenplayVersionId,
                    data.screenplayVersionId,
                  ),
                  inArray(
                    breakdownOccurrences.elementId,
                    db
                      .select({ id: breakdownElements.id })
                      .from(breakdownElements)
                      .where(
                        and(
                          eq(breakdownElements.projectId, access.project.id),
                          inArray(breakdownElements.id, data.elementIds),
                        ),
                      ),
                  ),
                ),
              )
              .returning({ id: breakdownOccurrences.id }),
            (e) => new DbError("bulkSetOccurrenceStatusForElements", e),
          ).map((rows) => ({ updated: rows.length })),
        ),
      ),
  );
