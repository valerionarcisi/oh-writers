import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { ResultAsync, ok, err, okAsync, errAsync } from "neverthrow";
import {
  budgets,
  budgetLines,
  budgetRates,
  budgetCast,
  budgetCrew,
  projectRateCard,
  breakdownElements,
  breakdownOccurrences,
  scenes,
  projects,
  screenplays,
  schedules,
  shootingDays,
  strips,
  type BudgetCast,
  type BudgetCrew,
  type ProjectRateCard,
} from "@oh-writers/db/schema";
import {
  BudgetSchema,
  BudgetLineSchema,
  estimateShootingDays,
  generateBudgetLines,
  computeBudgetSummary,
  lineEffectiveTotal,
  CREW_ROLES,
  RATE_UNITS,
  type Budget,
  type BudgetLine,
  type BudgetSummary,
  type RateKey,
  type FiscalRegime,
  type RateUnit,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { withProjectAccess } from "~/server/pipeline";
import { requireProjectAccess } from "~/server/access";
import {
  BudgetNotFoundError,
  BudgetLineNotFoundError,
  BudgetLockedError,
  NoBreakdownError,
  ForbiddenError,
  DbError,
} from "../budget.errors";
import { ProjectNotFoundError } from "~/features/projects";
import {
  aggregateProductionLines,
  computeBudgetOverview,
  computeDayCosts,
  type BudgetOverview,
  type PerElementLineCost,
  type DayCost,
} from "./budget-helpers";
import { resourceTotal } from "@oh-writers/domain";
import { getProjectBreakdownRows } from "~/features/breakdown";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseLine = (row: typeof budgetLines.$inferSelect): BudgetLine =>
  BudgetLineSchema.parse({
    ...row,
    quantity: row.quantity !== null ? Number(row.quantity) : null,
    rate: row.rate !== null ? Number(row.rate) : null,
    actual: row.actual !== null ? Number(row.actual) : null,
  });

/** Find the budget for a project. Returns `null` when none exists yet — that
 *  is a real domain state ("budget not generated"), not an error. */
const findBudgetWithLines = (
  db: Db,
  projectId: string,
): ResultAsync<Budget | null, DbError> =>
  ResultAsync.fromPromise(
    (async () => {
      const budget = await db.query.budgets.findFirst({
        where: eq(budgets.projectId, projectId),
      });
      if (!budget) return null;
      const lines = await db.query.budgetLines.findMany({
        where: eq(budgetLines.budgetId, budget.id),
        orderBy: (t) => t.sortOrder,
      });
      return BudgetSchema.parse({
        id: budget.id,
        projectId: budget.projectId,
        currency: budget.currency,
        contingencyPercent: Number(budget.contingencyPercent),
        shootingDays: budget.shootingDays,
        status: budget.status,
        generatedAt: budget.generatedAt?.toISOString() ?? null,
        lines: lines.map(parseLine),
      });
    })(),
    (e) => new DbError("findBudgetWithLines", e),
  );

const loadRateOverrides = async (
  db: Db,
  budgetId: string,
): Promise<Partial<Record<RateKey, number>>> => {
  const rows = await db.query.budgetRates.findMany({
    where: eq(budgetRates.budgetId, budgetId),
  });
  return Object.fromEntries(
    rows.map((r) => [r.rateKey, Number(r.value)]),
  ) as Partial<Record<RateKey, number>>;
};

const resolveVersionId = async (
  db: Db,
  projectId: string,
): Promise<string | null> => {
  const screenplay = await db.query.screenplays.findFirst({
    where: eq(screenplays.projectId, projectId),
  });
  return screenplay?.currentVersionId ?? null;
};

// ─── Lookup helpers (Phase 2b) ──────────────────────────────────────────────
//
// Each `findXById` returns `ResultAsync<X, NotFoundError | DbError>`. They are
// the canonical way to fetch a row by id; never `Promise<X | null>`. Combine
// with `withProjectAccess` to derive the project scope when the handler input
// only has a child-entity id.

const findBudgetRowById = (
  db: Db,
  id: string,
): ResultAsync<typeof budgets.$inferSelect, BudgetNotFoundError | DbError> =>
  ResultAsync.fromPromise(
    db.query.budgets.findFirst({ where: eq(budgets.id, id) }),
    (e) => new DbError("findBudgetRowById", e),
  ).andThen((row) => (row ? ok(row) : err(new BudgetNotFoundError(id))));

const findBudgetLineRowById = (
  db: Db,
  id: string,
): ResultAsync<
  typeof budgetLines.$inferSelect,
  BudgetLineNotFoundError | DbError
> =>
  ResultAsync.fromPromise(
    db.query.budgetLines.findFirst({ where: eq(budgetLines.id, id) }),
    (e) => new DbError("findBudgetLineRowById", e),
  ).andThen((row) => (row ? ok(row) : err(new BudgetLineNotFoundError(id))));

const findBudgetCastRowById = (
  db: Db,
  id: string,
): ResultAsync<typeof budgetCast.$inferSelect, DbError> =>
  ResultAsync.fromPromise(
    db.query.budgetCast.findFirst({ where: eq(budgetCast.id, id) }),
    (e) => new DbError("findBudgetCastRowById", e),
  ).andThen((row) =>
    row ? ok(row) : err(new DbError("findBudgetCastRowById", "row not found")),
  );

const findBudgetCrewRowById = (
  db: Db,
  id: string,
): ResultAsync<typeof budgetCrew.$inferSelect, DbError> =>
  ResultAsync.fromPromise(
    db.query.budgetCrew.findFirst({ where: eq(budgetCrew.id, id) }),
    (e) => new DbError("findBudgetCrewRowById", e),
  ).andThen((row) =>
    row ? ok(row) : err(new DbError("findBudgetCrewRowById", "row not found")),
  );

const findRateEntryById = (
  db: Db,
  id: string,
): ResultAsync<typeof projectRateCard.$inferSelect, DbError> =>
  ResultAsync.fromPromise(
    db.query.projectRateCard.findFirst({ where: eq(projectRateCard.id, id) }),
    (e) => new DbError("findRateEntryById", e),
  ).andThen((row) =>
    row ? ok(row) : err(new DbError("findRateEntryById", "entry not found")),
  );

// ─── getBudget ────────────────────────────────────────────────────────────────

export const getBudget = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        Budget | null,
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          findBudgetWithLines(db, access.project.id),
        ),
      ),
  );

// ─── generateBudget ───────────────────────────────────────────────────────────

export const generateBudget = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        Budget,
        ProjectNotFoundError | ForbiddenError | NoBreakdownError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db, access }) => {
          const project = access.project;
          const projectId = project.id;
          return ResultAsync.fromPromise(
            (async (): Promise<Budget> => {
              // resolve current screenplay version
              const versionId = await resolveVersionId(db, projectId);
              if (!versionId) throw new NoBreakdownError();

              // load breakdown rows
              const breakdownResult = await getProjectBreakdownRows(
                db,
                projectId,
                versionId,
              );
              if (breakdownResult.isErr()) throw breakdownResult.error;
              const rows = breakdownResult.value;
              if (rows.length === 0) throw new NoBreakdownError();

              // resolve shooting days:
              // 1. manual override on existing budget wins
              // 2. count actual days from schedule if one exists
              // 3. fall back to estimate from scene count
              const existingBudget = await db.query.budgets.findFirst({
                where: eq(budgets.projectId, projectId),
              });

              const scheduleInfo = await (async () => {
                const schedule = await db.query.schedules.findFirst({
                  where: eq(schedules.projectId, projectId),
                });
                if (!schedule) return null;
                const dayRows = await db
                  .select({ id: shootingDays.id })
                  .from(shootingDays)
                  .where(eq(shootingDays.scheduleId, schedule.id));
                const stripRows = await db
                  .select({
                    shootingDayId: strips.shootingDayId,
                    sceneId: strips.sceneId,
                  })
                  .from(strips)
                  .where(eq(strips.scheduleId, schedule.id));
                const sceneTodays = new Map<string, Set<string>>();
                for (const s of stripRows) {
                  if (!s.shootingDayId) continue;
                  const set = sceneTodays.get(s.sceneId) ?? new Set();
                  set.add(s.shootingDayId);
                  sceneTodays.set(s.sceneId, set);
                }
                return {
                  dayCount: dayRows.length > 0 ? dayRows.length : null,
                  sceneTodays,
                };
              })();

              const resolvedShootingDays =
                existingBudget?.shootingDays ??
                scheduleInfo?.dayCount ??
                estimateShootingDays(
                  rows.reduce(
                    (max, r) =>
                      Math.max(
                        max,
                        ...r.scenesPresent.map((s) => s.sceneNumber),
                      ),
                    0,
                  ),
                  project.format ?? "feature",
                );

              // load rate overrides
              const rateOverrides = existingBudget
                ? await loadRateOverrides(db, existingBudget.id)
                : {};

              // generate lines from breakdown
              const generatedLines = generateBudgetLines(
                {
                  rows: rows.map((r) => ({
                    element: {
                      id: r.element.id,
                      name: r.element.name,
                      category: r.element.category,
                      castTier: r.element.castTier,
                    },
                    totalQuantity: r.totalQuantity,
                    scenesPresent: r.scenesPresent,
                  })),
                  shootingDays: resolvedShootingDays,
                },
                rateOverrides,
              );

              // upsert budget + replace lines atomically
              let budgetId: string;
              if (existingBudget) {
                budgetId = existingBudget.id;
                await db
                  .update(budgets)
                  .set({
                    status: "estimated",
                    generatedAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(budgets.id, budgetId));
              } else {
                const [inserted] = await db
                  .insert(budgets)
                  .values({
                    projectId,
                    shootingDays: resolvedShootingDays,
                    status: "estimated",
                    generatedAt: new Date(),
                  })
                  .returning();
                budgetId = inserted!.id;
              }

              // 1. Split generated lines into per-element and aggregate
              const { perElement, aggregate } =
                aggregateProductionLines(generatedLines);

              // 2. Batch: fetch all occurrences for per-element elements in one query
              const allPerElementIds = perElement
                .map((l) => l.linkedElementId!)
                .filter(Boolean);

              const allOccurrences =
                allPerElementIds.length > 0
                  ? await db
                      .select({
                        elementId: breakdownOccurrences.elementId,
                        sceneId: breakdownOccurrences.sceneId,
                      })
                      .from(breakdownOccurrences)
                      .where(
                        inArray(
                          breakdownOccurrences.elementId,
                          allPerElementIds,
                        ),
                      )
                  : [];

              // Build elementId → Set<shootingDayId> map
              const elementDayMap = new Map<string, Set<string>>();
              for (const occ of allOccurrences) {
                const daySet = elementDayMap.get(occ.elementId) ?? new Set();
                if (scheduleInfo) {
                  const days = scheduleInfo.sceneTodays.get(occ.sceneId);
                  if (days) for (const d of days) daySet.add(d);
                }
                elementDayMap.set(occ.elementId, daySet);
              }

              // Batch: fetch all existing per-element budget lines in one query
              const existingPerElementLines =
                allPerElementIds.length > 0
                  ? await db
                      .select()
                      .from(budgetLines)
                      .where(
                        and(
                          eq(budgetLines.budgetId, budgetId),
                          inArray(
                            budgetLines.linkedElementId,
                            allPerElementIds,
                          ),
                        ),
                      )
                  : [];
              const existingByElementId = new Map(
                existingPerElementLines.map((l) => [l.linkedElementId!, l]),
              );

              // 3. Upsert per-element lines (locations, vehicles), preserving actual
              for (const line of perElement) {
                const daySet =
                  elementDayMap.get(line.linkedElementId!) ?? new Set();
                const qty =
                  scheduleInfo && daySet.size > 0 ? daySet.size : line.quantity;

                const existing = existingByElementId.get(line.linkedElementId!);
                if (existing) {
                  await db
                    .update(budgetLines)
                    .set({
                      quantity: String(qty),
                      rate: String(line.rate ?? 0),
                      updatedAt: new Date(),
                    })
                    .where(eq(budgetLines.id, existing.id));
                } else {
                  await db.insert(budgetLines).values({
                    budgetId,
                    topSheet: line.topSheet,
                    name: line.name,
                    costType: line.costType,
                    quantity: String(qty),
                    rate: String(line.rate ?? 0),
                    actual: null,
                    notes: null,
                    linkedElementId: line.linkedElementId,
                    linkedCategory: line.linkedCategory,
                    sortOrder: line.sortOrder,
                  });
                }
              }

              // Batch: fetch all existing aggregate lines in one query
              const aggregateCategories = aggregate
                .map((l) => l.linkedCategory!)
                .filter(Boolean);
              const existingAggregateLines =
                aggregateCategories.length > 0
                  ? await db
                      .select()
                      .from(budgetLines)
                      .where(
                        and(
                          eq(budgetLines.budgetId, budgetId),
                          inArray(
                            budgetLines.linkedCategory,
                            aggregateCategories,
                          ),
                          isNull(budgetLines.linkedElementId),
                        ),
                      )
                  : [];
              const existingByCategory = new Map(
                existingAggregateLines.map((l) => [l.linkedCategory!, l]),
              );

              // 4. Upsert aggregate lines (one per collapsed category key), preserving actual
              for (const line of aggregate) {
                const existing = existingByCategory.get(line.linkedCategory!);
                if (existing) {
                  await db
                    .update(budgetLines)
                    .set({
                      quantity: String(line.quantity ?? 0),
                      rate: String(line.rate ?? 0),
                      updatedAt: new Date(),
                    })
                    .where(eq(budgetLines.id, existing.id));
                } else {
                  await db.insert(budgetLines).values({
                    budgetId,
                    topSheet: line.topSheet,
                    name: line.name,
                    costType: line.costType,
                    quantity: String(line.quantity ?? 0),
                    rate: String(line.rate ?? 0),
                    actual: null,
                    notes: null,
                    linkedElementId: null,
                    linkedCategory: line.linkedCategory,
                    sortOrder: line.sortOrder,
                  });
                }
              }

              // Load rate card for this project to pre-fill cast rates
              const rateCardRows = await db.query.projectRateCard.findMany({
                where: eq(projectRateCard.projectId, projectId),
              });
              const rateByName = new Map(
                rateCardRows.map((r) => [r.name.toLowerCase(), r]),
              );

              // Populate cast from breakdown cast elements
              await db
                .delete(budgetCast)
                .where(eq(budgetCast.budgetId, budgetId));
              const castRows = rows.filter(
                (r) => r.element.category === "cast",
              );
              if (castRows.length > 0) {
                await db.insert(budgetCast).values(
                  castRows.map((r, idx) => {
                    const rate = rateByName.get(r.element.name.toLowerCase());
                    const units =
                      rate?.rateUnit === "forfait" ? 1 : resolvedShootingDays;
                    return {
                      budgetId,
                      elementId: r.element.id,
                      name: r.element.name,
                      days: String(units),
                      dayRate: rate ? String(rate.rateValue) : "0",
                      rateUnit: (rate?.rateUnit ??
                        "giornata") as (typeof RATE_UNITS)[number],
                      fiscalRegime: (rate?.fiscalRegime ??
                        "piva") as FiscalRegime,
                      mealAllowance: rate
                        ? String(Number(rate.mealAllowance) * units)
                        : "0",
                      accommodation: rate
                        ? String(Number(rate.accommodation) * units)
                        : "0",
                      sortOrder: idx,
                    };
                  }),
                );
              }

              // Populate crew with defaults only on first generation
              const existingCrewCount = await db.query.budgetCrew
                .findMany({ where: eq(budgetCrew.budgetId, budgetId) })
                .then((r) => r.length);
              if (existingCrewCount === 0) {
                await db.insert(budgetCrew).values(
                  CREW_ROLES.map((role, idx) => ({
                    budgetId,
                    roleKey: role.key,
                    name: role.labelIt,
                    department: role.department,
                    days: String(resolvedShootingDays),
                    dayRate: String(role.defaultDayRate),
                    fiscalRegime: "piva" as const,
                    mealAllowance: "0",
                    accommodation: "0",
                    enabled: true,
                    sortOrder: idx,
                  })),
                );
              }

              const reloadResult = await findBudgetWithLines(db, projectId);
              if (reloadResult.isErr()) throw reloadResult.error;
              if (!reloadResult.value)
                throw new DbError(
                  "generateBudget",
                  "budget missing after insert",
                );
              return reloadResult.value;
            })(),
            (e: unknown) =>
              (e instanceof NoBreakdownError
                ? e
                : e instanceof DbError
                  ? e
                  : new DbError("generateBudget", e)) as
                | NoBreakdownError
                | DbError,
          );
        }),
      ),
  );

// ─── updateBudgetLine ─────────────────────────────────────────────────────────

export const updateBudgetLine = createServerFn({ method: "POST" })
  .validator(
    z.object({
      lineId: z.string().uuid(),
      patch: z.object({
        actual: z.number().nullable().optional(),
        rate: z.number().nullable().optional(),
        quantity: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetLine,
        | BudgetLineNotFoundError
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetLineRowById(db, data.lineId).andThen((line) =>
            findBudgetRowById(db, line.budgetId).andThen((budget) =>
              requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
                if (budget.status === "locked")
                  return errAsync(new BudgetLockedError());
                const set: Record<string, unknown> = { updatedAt: new Date() };
                if (data.patch.actual !== undefined)
                  set.actual =
                    data.patch.actual !== null
                      ? String(data.patch.actual)
                      : null;
                if (data.patch.rate !== undefined)
                  set.rate =
                    data.patch.rate !== null ? String(data.patch.rate) : null;
                if (data.patch.quantity !== undefined)
                  set.quantity =
                    data.patch.quantity !== null
                      ? String(data.patch.quantity)
                      : null;
                if (data.patch.notes !== undefined)
                  set.notes = data.patch.notes;
                return ResultAsync.fromPromise(
                  db
                    .update(budgetLines)
                    .set(set)
                    .where(eq(budgetLines.id, data.lineId))
                    .returning()
                    .then(([r]) => parseLine(r!)),
                  (e) => new DbError("updateBudgetLine", e),
                );
              }),
            ),
          ),
        ),
      ),
  );

// ─── updateBudgetSettings ─────────────────────────────────────────────────────

export const updateBudgetSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      budgetId: z.string().uuid(),
      shootingDays: z.number().int().min(1).nullable().optional(),
      contingencyPercent: z.number().min(0).max(50).optional(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        Budget,
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetRowById(db, data.budgetId).andThen((budget) =>
            requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
              if (budget.status === "locked")
                return errAsync(new BudgetLockedError());
              const set: Record<string, unknown> = { updatedAt: new Date() };
              if (data.shootingDays !== undefined)
                set.shootingDays = data.shootingDays;
              if (data.contingencyPercent !== undefined)
                set.contingencyPercent = String(data.contingencyPercent);
              return ResultAsync.fromPromise(
                db
                  .update(budgets)
                  .set(set)
                  .where(eq(budgets.id, data.budgetId)),
                (e) => new DbError("updateBudgetSettings", e),
              )
                .andThen(() => findBudgetWithLines(db, budget.projectId))
                .andThen((updated) =>
                  updated
                    ? ok(updated)
                    : err(new DbError("updateBudgetSettings", "reload failed")),
                );
            }),
          ),
        ),
      ),
  );

// ─── getBudgetSummary ─────────────────────────────────────────────────────────

export const getBudgetSummary = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetSummary | null,
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          findBudgetWithLines(db, access.project.id).map((budget) =>
            budget
              ? computeBudgetSummary(budget.lines, budget.contingencyPercent)
              : null,
          ),
        ),
      ),
  );

// ─── getCastAndCrew ───────────────────────────────────────────────────────────

export type CastSceneMap = Record<string, number[]>;

export const getCastAndCrew = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        {
          cast: BudgetCast[];
          crew: BudgetCrew[];
          castSceneMap: CastSceneMap;
        } | null,
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            (async () => {
              const projectId = access.project.id;
              const budget = await db.query.budgets.findFirst({
                where: eq(budgets.projectId, projectId),
              });
              if (!budget) return null;

              const SLUGLINE_PREFIX = /^(INT|EXT|EST|I\/E|INT\/EXT)\.?\b/i;

              const [rawCast, crew] = await Promise.all([
                db.query.budgetCast.findMany({
                  where: eq(budgetCast.budgetId, budget.id),
                  orderBy: (t) => t.sortOrder,
                }),
                db.query.budgetCrew.findMany({
                  where: eq(budgetCrew.budgetId, budget.id),
                  orderBy: (t) => t.sortOrder,
                }),
              ]);
              // strip breakdown noise: slugline tokens (Int, Ext, Est) misidentified as cast
              const cast = rawCast.filter((r) => !SLUGLINE_PREFIX.test(r.name));

              // Build castSceneMap: cast row id → scene numbers they appear in
              const castSceneMap: CastSceneMap = {};
              for (const row of cast) {
                if (!row.elementId) {
                  castSceneMap[row.id] = [];
                  continue;
                }
                const occurrences = await db
                  .select({ sceneNumber: scenes.number })
                  .from(breakdownOccurrences)
                  .innerJoin(
                    scenes,
                    eq(breakdownOccurrences.sceneId, scenes.id),
                  )
                  .where(eq(breakdownOccurrences.elementId, row.elementId));
                castSceneMap[row.id] = [
                  ...new Set(occurrences.map((o) => o.sceneNumber)),
                ].sort((a, b) => a - b);
              }

              return { cast, crew, castSceneMap };
            })(),
            (e) => new DbError("getCastAndCrew", e),
          ),
        ),
      ),
  );

// ─── getProjectScenes ─────────────────────────────────────────────────────────

export type SceneChip = { number: number; heading: string };

export const getProjectScenes = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<SceneChip[], ProjectNotFoundError | ForbiddenError | DbError>
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            (async () => {
              const screenplay = await db.query.screenplays.findFirst({
                where: eq(screenplays.projectId, access.project.id),
              });
              if (!screenplay?.currentVersionId) return [];
              return db
                .select({ number: scenes.number, heading: scenes.heading })
                .from(scenes)
                .where(eq(scenes.screenplayId, screenplay.id))
                .orderBy(scenes.number);
            })(),
            (e) => new DbError("getProjectScenes", e),
          ),
        ),
      ),
  );

// ─── updateBudgetCastRow ──────────────────────────────────────────────────────

const CastPatchSchema = z.object({
  days: z.number().min(0).optional(),
  dayRate: z.number().min(0).optional(),
  fiscalRegime: z.enum(["piva", "privato", "none"]).optional(),
  mealAllowance: z.number().min(0).optional(),
  accommodation: z.number().min(0).optional(),
});

export const updateBudgetCastRow = createServerFn({ method: "POST" })
  .validator(z.object({ rowId: z.string().uuid(), patch: CastPatchSchema }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetCast,
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetCastRowById(db, data.rowId).andThen((row) =>
            findBudgetRowById(db, row.budgetId).andThen((budget) =>
              requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
                if (budget.status === "locked")
                  return errAsync(new BudgetLockedError());
                const set: Record<string, unknown> = { updatedAt: new Date() };
                if (data.patch.days !== undefined)
                  set.days = String(data.patch.days);
                if (data.patch.dayRate !== undefined)
                  set.dayRate = String(data.patch.dayRate);
                if (data.patch.fiscalRegime !== undefined)
                  set.fiscalRegime = data.patch.fiscalRegime;
                if (data.patch.mealAllowance !== undefined)
                  set.mealAllowance = String(data.patch.mealAllowance);
                if (data.patch.accommodation !== undefined)
                  set.accommodation = String(data.patch.accommodation);
                return ResultAsync.fromPromise(
                  db
                    .update(budgetCast)
                    .set(set)
                    .where(eq(budgetCast.id, data.rowId))
                    .returning()
                    .then(([r]) => r!),
                  (e) => new DbError("updateBudgetCastRow", e),
                );
              }),
            ),
          ),
        ),
      ),
  );

// ─── updateBudgetCrewRow ──────────────────────────────────────────────────────

const CrewPatchSchema = z.object({
  days: z.number().min(0).optional(),
  dayRate: z.number().min(0).optional(),
  fiscalRegime: z.enum(["piva", "privato", "none"]).optional(),
  mealAllowance: z.number().min(0).optional(),
  accommodation: z.number().min(0).optional(),
  enabled: z.boolean().optional(),
});

export const updateBudgetCrewRow = createServerFn({ method: "POST" })
  .validator(z.object({ rowId: z.string().uuid(), patch: CrewPatchSchema }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetCrew,
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetCrewRowById(db, data.rowId).andThen((row) =>
            findBudgetRowById(db, row.budgetId).andThen((budget) =>
              requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
                if (budget.status === "locked")
                  return errAsync(new BudgetLockedError());
                const set: Record<string, unknown> = { updatedAt: new Date() };
                if (data.patch.days !== undefined)
                  set.days = String(data.patch.days);
                if (data.patch.dayRate !== undefined)
                  set.dayRate = String(data.patch.dayRate);
                if (data.patch.fiscalRegime !== undefined)
                  set.fiscalRegime = data.patch.fiscalRegime;
                if (data.patch.mealAllowance !== undefined)
                  set.mealAllowance = String(data.patch.mealAllowance);
                if (data.patch.accommodation !== undefined)
                  set.accommodation = String(data.patch.accommodation);
                if (data.patch.enabled !== undefined)
                  set.enabled = data.patch.enabled;
                return ResultAsync.fromPromise(
                  db
                    .update(budgetCrew)
                    .set(set)
                    .where(eq(budgetCrew.id, data.rowId))
                    .returning()
                    .then(([r]) => r!),
                  (e) => new DbError("updateBudgetCrewRow", e),
                );
              }),
            ),
          ),
        ),
      ),
  );

// ─── addBudgetCrewRow ─────────────────────────────────────────────────────────

export const addBudgetCrewRow = createServerFn({ method: "POST" })
  .validator(
    z.object({
      budgetId: z.string().uuid(),
      name: z.string().min(1),
      department: z.string().min(1),
      days: z.number().min(0).default(1),
      dayRate: z.number().min(0).default(0),
      fiscalRegime: z.enum(["piva", "privato", "none"]).default("piva"),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetCrew,
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetRowById(db, data.budgetId).andThen((budget) =>
            requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
              if (budget.status === "locked")
                return errAsync(new BudgetLockedError());
              return ResultAsync.fromPromise(
                (async () => {
                  const maxSort = await db.query.budgetCrew
                    .findMany({ where: eq(budgetCrew.budgetId, data.budgetId) })
                    .then((rows) =>
                      rows.reduce((m, r) => Math.max(m, r.sortOrder), -1),
                    );
                  const [inserted] = await db
                    .insert(budgetCrew)
                    .values({
                      budgetId: data.budgetId,
                      roleKey: null,
                      name: data.name,
                      department: data.department,
                      days: String(data.days),
                      dayRate: String(data.dayRate),
                      fiscalRegime: data.fiscalRegime,
                      mealAllowance: "0",
                      accommodation: "0",
                      enabled: true,
                      sortOrder: maxSort + 1,
                    })
                    .returning();
                  return inserted!;
                })(),
                (e) => new DbError("addBudgetCrewRow", e),
              );
            }),
          ),
        ),
      ),
  );

// ─── removeBudgetCrewRow ──────────────────────────────────────────────────────

export const removeBudgetCrewRow = createServerFn({ method: "POST" })
  .validator(z.object({ rowId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { id: string },
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetCrewRowById(db, data.rowId).andThen((row) =>
            findBudgetRowById(db, row.budgetId).andThen((budget) =>
              requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
                if (budget.status === "locked")
                  return errAsync(new BudgetLockedError());
                return ResultAsync.fromPromise(
                  db
                    .delete(budgetCrew)
                    .where(eq(budgetCrew.id, data.rowId))
                    .then(() => ({ id: data.rowId })),
                  (e) => new DbError("removeBudgetCrewRow", e),
                );
              }),
            ),
          ),
        ),
      ),
  );

// ─── getRateCard ──────────────────────────────────────────────────────────────

export const getRateCard = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        ProjectRateCard[],
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            db.query.projectRateCard.findMany({
              where: eq(projectRateCard.projectId, access.project.id),
              orderBy: (t, { asc }) => asc(t.sortOrder),
            }),
            (e) => new DbError("getRateCard", e),
          ),
        ),
      ),
  );

// ─── upsertRateEntry ──────────────────────────────────────────────────────────

const RateEntrySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  role: z.string().nullable().default(null),
  rateUnit: z.enum(["giornata", "posa", "forfait"]).default("giornata"),
  rateValue: z.number().min(0).default(0),
  mealAllowance: z.number().min(0).default(0),
  accommodation: z.number().min(0).default(0),
  fiscalRegime: z.enum(["piva", "privato", "none"]).default("piva"),
});

export const upsertRateEntry = createServerFn({ method: "POST" })
  .validator(RateEntrySchema)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        ProjectRateCard,
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db }) =>
          ResultAsync.fromPromise(
            (async () => {
              const existing = await db.query.projectRateCard.findFirst({
                where: and(
                  eq(projectRateCard.projectId, data.projectId),
                  eq(projectRateCard.name, data.name),
                ),
              });
              if (existing) {
                const [updated] = await db
                  .update(projectRateCard)
                  .set({
                    role: data.role,
                    rateUnit: data.rateUnit,
                    rateValue: String(data.rateValue),
                    mealAllowance: String(data.mealAllowance),
                    accommodation: String(data.accommodation),
                    fiscalRegime: data.fiscalRegime,
                    updatedAt: new Date(),
                  })
                  .where(eq(projectRateCard.id, existing.id))
                  .returning();
                return updated!;
              }
              const maxSort = await db.query.projectRateCard
                .findMany({
                  where: eq(projectRateCard.projectId, data.projectId),
                })
                .then((rows) =>
                  rows.reduce((m, r) => Math.max(m, r.sortOrder), -1),
                );
              const [inserted] = await db
                .insert(projectRateCard)
                .values({
                  projectId: data.projectId,
                  name: data.name,
                  role: data.role,
                  rateUnit: data.rateUnit,
                  rateValue: String(data.rateValue),
                  mealAllowance: String(data.mealAllowance),
                  accommodation: String(data.accommodation),
                  fiscalRegime: data.fiscalRegime,
                  sortOrder: maxSort + 1,
                })
                .returning();
              return inserted!;
            })(),
            (e) => new DbError("upsertRateEntry", e),
          ),
        ),
      ),
  );

// ─── deleteRateEntry ──────────────────────────────────────────────────────────

export const deleteRateEntry = createServerFn({ method: "POST" })
  .validator(z.object({ entryId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { id: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findRateEntryById(db, data.entryId).andThen((entry) =>
            requireProjectAccess(db, entry.projectId, "edit").andThen(() =>
              ResultAsync.fromPromise(
                db
                  .delete(projectRateCard)
                  .where(eq(projectRateCard.id, data.entryId))
                  .then(() => ({ id: data.entryId })),
                (e) => new DbError("deleteRateEntry", e),
              ),
            ),
          ),
        ),
      ),
  );

// ─── getDayCosts ──────────────────────────────────────────────────────────────

export type { DayCost } from "./budget-helpers";

export const getDayCosts = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<DayCost[], ProjectNotFoundError | ForbiddenError | DbError>
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            (async (): Promise<DayCost[]> => {
              const projectId = access.project.id;
              const schedule = await db.query.schedules.findFirst({
                where: eq(schedules.projectId, projectId),
              });
              if (!schedule) return [];

              const budget = await db.query.budgets.findFirst({
                where: eq(budgets.projectId, projectId),
              });
              if (!budget) return [];

              const dayRows = await db.query.shootingDays.findMany({
                where: and(
                  eq(shootingDays.scheduleId, schedule.id),
                  eq(shootingDays.dayType, "shoot"),
                ),
                orderBy: (t) => t.dayNumber,
              });
              if (dayRows.length === 0) return [];

              const stripRows = await db
                .select({
                  shootingDayId: strips.shootingDayId,
                  sceneId: strips.sceneId,
                })
                .from(strips)
                .where(eq(strips.scheduleId, schedule.id));

              const dayScenes = new Map<string, string[]>();
              for (const s of stripRows) {
                if (!s.shootingDayId) continue;
                const arr = dayScenes.get(s.shootingDayId) ?? [];
                arr.push(s.sceneId);
                dayScenes.set(s.shootingDayId, arr);
              }

              const castRows = await db.query.budgetCast.findMany({
                where: eq(budgetCast.budgetId, budget.id),
              });

              const elementIds = castRows
                .map((r) => r.elementId)
                .filter((id): id is string => id !== null);

              const castOccurrences =
                elementIds.length > 0
                  ? await db
                      .select({
                        elementId: breakdownOccurrences.elementId,
                        sceneId: breakdownOccurrences.sceneId,
                      })
                      .from(breakdownOccurrences)
                      .where(
                        inArray(breakdownOccurrences.elementId, elementIds),
                      )
                  : [];

              const occsByElement = new Map<string, string[]>();
              for (const occ of castOccurrences) {
                const arr = occsByElement.get(occ.elementId) ?? [];
                arr.push(occ.sceneId);
                occsByElement.set(occ.elementId, arr);
              }

              const castCostsByScene: Record<string, number> = {};
              for (const row of castRows) {
                const sceneIds = row.elementId
                  ? (occsByElement.get(row.elementId) ?? [])
                  : [];
                if (sceneIds.length === 0) continue;
                const total =
                  Number(row.dayRate) * Number(row.days) +
                  Number(row.mealAllowance) +
                  Number(row.accommodation);
                const perScene = total / sceneIds.length;
                for (const sid of sceneIds) {
                  castCostsByScene[sid] =
                    (castCostsByScene[sid] ?? 0) + perScene;
                }
              }

              const crewRows = await db.query.budgetCrew.findMany({
                where: and(
                  eq(budgetCrew.budgetId, budget.id),
                  eq(budgetCrew.enabled, true),
                ),
              });
              const totalCrewCost = crewRows.reduce(
                (sum, r) =>
                  sum +
                  Number(r.dayRate) * Number(r.days) +
                  Number(r.mealAllowance) +
                  Number(r.accommodation),
                0,
              );

              const prodLines = await db.query.budgetLines.findMany({
                where: and(
                  eq(budgetLines.budgetId, budget.id),
                  eq(budgetLines.topSheet, "production"),
                ),
              });

              const perElementLineCosts: PerElementLineCost[] = [];
              let otherLinesTotalCost = 0;

              const prodElementIds = prodLines
                .filter(
                  (l) =>
                    l.linkedElementId !== null &&
                    (l.linkedCategory === "locations" ||
                      l.linkedCategory === "vehicles"),
                )
                .map((l) => l.linkedElementId as string);

              const prodOccurrences =
                prodElementIds.length > 0
                  ? await db
                      .select({
                        elementId: breakdownOccurrences.elementId,
                        sceneId: breakdownOccurrences.sceneId,
                      })
                      .from(breakdownOccurrences)
                      .where(
                        inArray(breakdownOccurrences.elementId, prodElementIds),
                      )
                  : [];

              const prodOccsByElement = new Map<string, string[]>();
              for (const occ of prodOccurrences) {
                const arr = prodOccsByElement.get(occ.elementId) ?? [];
                arr.push(occ.sceneId);
                prodOccsByElement.set(occ.elementId, arr);
              }

              for (const line of prodLines) {
                const effective =
                  line.actual !== null
                    ? Number(line.actual)
                    : Number(line.quantity ?? 1) * Number(line.rate ?? 0);

                if (
                  line.linkedElementId &&
                  (line.linkedCategory === "locations" ||
                    line.linkedCategory === "vehicles")
                ) {
                  perElementLineCosts.push({
                    linkedCategory: line.linkedCategory,
                    sceneIds: prodOccsByElement.get(line.linkedElementId) ?? [],
                    effectiveTotal: effective,
                  });
                } else {
                  otherLinesTotalCost += effective;
                }
              }

              const days = dayRows.map((d) => ({
                id: d.id,
                dayNumber: d.dayNumber,
                date: d.date,
                sceneIds: dayScenes.get(d.id) ?? [],
              }));

              return computeDayCosts({
                days,
                totalShootingDays: dayRows.length,
                contingencyPercent: Number(budget.contingencyPercent),
                castCostsByScene,
                totalCrewCost,
                perElementLineCosts,
                otherLinesTotalCost,
              });
            })(),
            (e) => new DbError("getDayCosts", e),
          ),
        ),
      ),
  );

// ─── getBudgetOverview ────────────────────────────────────────────────────────
//
// Returns the executive aggregation used by the Panoramica view. Builds on top
// of `findBudgetWithLines` + cast/crew rows + a count of scenes for cost/scene.
// Returns `null` when no budget exists yet (day-zero) so the UI can render an
// empty-state.
//
// ─── addBudgetCastRow ─────────────────────────────────────────────────────────

export const addBudgetCastRow = createServerFn({ method: "POST" })
  .validator(
    z.object({
      budgetId: z.string().uuid(),
      name: z.string().min(1),
      days: z.number().min(0).default(1),
      dayRate: z.number().min(0).default(0),
      fiscalRegime: z.enum(["piva", "privato", "none"]).default("piva"),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetCast,
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetRowById(db, data.budgetId).andThen((budget) =>
            requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
              if (budget.status === "locked")
                return errAsync(new BudgetLockedError());
              return ResultAsync.fromPromise(
                (async () => {
                  const maxSort = await db.query.budgetCast
                    .findMany({ where: eq(budgetCast.budgetId, data.budgetId) })
                    .then((rows) =>
                      rows.reduce((m, r) => Math.max(m, r.sortOrder), -1),
                    );
                  const [inserted] = await db
                    .insert(budgetCast)
                    .values({
                      budgetId: data.budgetId,
                      elementId: null,
                      name: data.name,
                      days: String(data.days),
                      dayRate: String(data.dayRate),
                      fiscalRegime: data.fiscalRegime,
                      mealAllowance: "0",
                      accommodation: "0",
                      sortOrder: maxSort + 1,
                    })
                    .returning();
                  return inserted!;
                })(),
                (e) => new DbError("addBudgetCastRow", e),
              );
            }),
          ),
        ),
      ),
  );

// ─── removeBudgetCastRow ──────────────────────────────────────────────────────

export const removeBudgetCastRow = createServerFn({ method: "POST" })
  .validator(z.object({ rowId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { id: string },
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetCastRowById(db, data.rowId).andThen((row) =>
            findBudgetRowById(db, row.budgetId).andThen((budget) =>
              requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
                if (budget.status === "locked")
                  return errAsync(new BudgetLockedError());
                return ResultAsync.fromPromise(
                  db
                    .delete(budgetCast)
                    .where(eq(budgetCast.id, data.rowId))
                    .then(() => ({ id: data.rowId })),
                  (e) => new DbError("removeBudgetCastRow", e),
                );
              }),
            ),
          ),
        ),
      ),
  );

// ─── addBudgetLine ────────────────────────────────────────────────────────────

export const addBudgetLine = createServerFn({ method: "POST" })
  .validator(
    z.object({
      budgetId: z.string().uuid(),
      topSheet: z.enum([
        "above_the_line",
        "production",
        "crew",
        "post_production",
        "contingency",
      ]),
      name: z.string().min(1),
      costType: z
        .enum(["daily", "flat", "weekly", "unit", "percentage"])
        .default("flat"),
      quantity: z.number().min(0).default(1),
      rate: z.number().min(0).default(0),
      linkedCategory: z.string().nullable().optional(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetLine,
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetRowById(db, data.budgetId).andThen((budget) =>
            requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
              if (budget.status === "locked")
                return errAsync(new BudgetLockedError());
              return ResultAsync.fromPromise(
                (async () => {
                  const maxSort = await db.query.budgetLines
                    .findMany({
                      where: eq(budgetLines.budgetId, data.budgetId),
                    })
                    .then((rows) =>
                      rows.reduce((m, r) => Math.max(m, r.sortOrder), -1),
                    );
                  const [inserted] = await db
                    .insert(budgetLines)
                    .values({
                      budgetId: data.budgetId,
                      topSheet: data.topSheet,
                      name: data.name,
                      costType: data.costType,
                      quantity: String(data.quantity),
                      rate: String(data.rate),
                      actual: null,
                      notes: null,
                      linkedElementId: null,
                      linkedCategory: data.linkedCategory ?? null,
                      sortOrder: maxSort + 1,
                    })
                    .returning();
                  return parseLine(inserted!);
                })(),
                (e) => new DbError("addBudgetLine", e),
              );
            }),
          ),
        ),
      ),
  );

// ─── removeBudgetLine ─────────────────────────────────────────────────────────

export const removeBudgetLine = createServerFn({ method: "POST" })
  .validator(z.object({ lineId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { id: string },
        | BudgetLineNotFoundError
        | BudgetNotFoundError
        | BudgetLockedError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
          findBudgetLineRowById(db, data.lineId).andThen((line) =>
            findBudgetRowById(db, line.budgetId).andThen((budget) =>
              requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
                if (budget.status === "locked")
                  return errAsync(new BudgetLockedError());
                return ResultAsync.fromPromise(
                  db
                    .delete(budgetLines)
                    .where(eq(budgetLines.id, data.lineId))
                    .then(() => ({ id: data.lineId })),
                  (e) => new DbError("removeBudgetLine", e),
                );
              }),
            ),
          ),
        ),
      ),
  );

// TODO(spec-overview): wire `previousTotal` to a real snapshot when
// `getPreviousBudgetSnapshot` lands. Currently hardcoded to null.

export type { BudgetOverview } from "./budget-helpers";

export const getBudgetOverview = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        BudgetOverview | null,
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          ResultAsync.fromPromise(
            (async (): Promise<BudgetOverview | null> => {
              const projectId = access.project.id;
              const budget = await db.query.budgets.findFirst({
                where: eq(budgets.projectId, projectId),
              });
              if (!budget) return null;

              const [lineRows, castRows, crewRows] = await Promise.all([
                db.query.budgetLines.findMany({
                  where: eq(budgetLines.budgetId, budget.id),
                }),
                db.query.budgetCast.findMany({
                  where: eq(budgetCast.budgetId, budget.id),
                }),
                db.query.budgetCrew.findMany({
                  where: eq(budgetCrew.budgetId, budget.id),
                }),
              ]);

              const SLUGLINE_PREFIX = /^(INT|EXT|EST|I\/E|INT\/EXT)\.?\b/i;
              const cleanCast = castRows.filter(
                (r) => !SLUGLINE_PREFIX.test(r.name),
              );

              const castTotal = cleanCast.reduce(
                (sum, r) =>
                  sum +
                  resourceTotal({
                    days: Number(r.days),
                    dayRate: Number(r.dayRate),
                    fiscalRegime: r.fiscalRegime as FiscalRegime,
                    mealAllowance: Number(r.mealAllowance),
                    accommodation: Number(r.accommodation),
                  }),
                0,
              );
              const castMissingRates = cleanCast.filter(
                (r) => Number(r.dayRate) <= 0,
              ).length;

              const enabledCrew = crewRows.filter((r) => r.enabled);
              const crewTotal = enabledCrew.reduce(
                (sum, r) =>
                  sum +
                  resourceTotal({
                    days: Number(r.days),
                    dayRate: Number(r.dayRate),
                    fiscalRegime: r.fiscalRegime as FiscalRegime,
                    mealAllowance: Number(r.mealAllowance),
                    accommodation: Number(r.accommodation),
                  }),
                0,
              );

              const screenplay = await db.query.screenplays.findFirst({
                where: eq(screenplays.projectId, projectId),
              });
              const sceneCount = screenplay
                ? await db
                    .select({ id: scenes.id })
                    .from(scenes)
                    .where(eq(scenes.screenplayId, screenplay.id))
                    .then((r) => r.length)
                : 0;

              return computeBudgetOverview({
                lines: lineRows.map((l) => ({
                  topSheet: l.topSheet,
                  linkedCategory: l.linkedCategory,
                  rate: l.rate !== null ? Number(l.rate) : null,
                  quantity: l.quantity !== null ? Number(l.quantity) : null,
                  actual: l.actual !== null ? Number(l.actual) : null,
                })),
                resources: {
                  castTotal,
                  castCount: cleanCast.length,
                  castMissingRates,
                  crewTotal,
                  crewEnabledCount: enabledCrew.length,
                },
                contingencyPercent: Number(budget.contingencyPercent),
                shootingDays: budget.shootingDays,
                sceneCount,
                status: budget.status as "draft" | "estimated" | "locked",
                previousTotal: null,
              });
            })(),
            (e) => new DbError("getBudgetOverview", e),
          ),
        ),
      ),
  );

// ─── queryOptions helpers (client) ───────────────────────────────────────────

export type {
  Budget,
  BudgetLine,
  BudgetSummary,
  BudgetCast,
  BudgetCrew,
  ProjectRateCard,
};
