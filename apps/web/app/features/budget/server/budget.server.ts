import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
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
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  BudgetNotFoundError,
  BudgetLineNotFoundError,
  BudgetLockedError,
  NoBreakdownError,
  ForbiddenError,
  DbError,
} from "../budget.errors";
import { resolveBudgetAccessByProjectId } from "./budget-access";
import { aggregateProductionLines } from "./budget-helpers";
import { getProjectBreakdownRows } from "~/features/breakdown/server/breakdown.server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const canEdit = (access: {
  isPersonalOwner: boolean;
  teamRole: string | null;
}) =>
  access.isPersonalOwner ||
  access.teamRole === "owner" ||
  access.teamRole === "editor";

const canView = (access: {
  isPersonalOwner: boolean;
  teamRole: string | null;
}) => access.isPersonalOwner || access.teamRole !== null;

const parseLine = (row: typeof budgetLines.$inferSelect): BudgetLine =>
  BudgetLineSchema.parse({
    ...row,
    quantity: row.quantity !== null ? Number(row.quantity) : null,
    rate: row.rate !== null ? Number(row.rate) : null,
    actual: row.actual !== null ? Number(row.actual) : null,
  });

const loadBudgetWithLines = async (
  db: Db,
  projectId: string,
): Promise<Budget | null> => {
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
};

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

// ─── getBudget ────────────────────────────────────────────────────────────────

export const getBudget = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<Budget | null, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canView(access.value))
        return toShape(err(new ForbiddenError("view budget")));

      const result = await ResultAsync.fromPromise(
        loadBudgetWithLines(db, data.projectId),
        (e) => new DbError("getBudget", e),
      );
      return toShape(result);
    },
  );

// ─── generateBudget ───────────────────────────────────────────────────────────

export const generateBudget = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<Budget, ForbiddenError | NoBreakdownError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("generate budget")));

      // load project for format
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, data.projectId),
      });
      if (!project)
        return toShape(err(new DbError("generateBudget", "project not found")));

      // resolve current screenplay version
      const versionId = await resolveVersionId(db, data.projectId);
      if (!versionId) return toShape(err(new NoBreakdownError()));

      // load breakdown rows
      const breakdownResult = await getProjectBreakdownRows(
        db,
        data.projectId,
        versionId,
      );
      if (breakdownResult.isErr()) return toShape(err(breakdownResult.error));

      const rows = breakdownResult.value;
      if (rows.length === 0) return toShape(err(new NoBreakdownError()));

      // resolve shooting days:
      // 1. manual override on existing budget wins
      // 2. count actual days from schedule if one exists
      // 3. fall back to estimate from scene count
      const existingBudget = await db.query.budgets.findFirst({
        where: eq(budgets.projectId, data.projectId),
      });

      const scheduledDayCount = await (async () => {
        const schedule = await db.query.schedules.findFirst({
          where: eq(schedules.projectId, data.projectId),
        });
        if (!schedule) return null;
        const days = await db
          .select({ id: shootingDays.id })
          .from(shootingDays)
          .where(eq(shootingDays.scheduleId, schedule.id));
        return days.length > 0 ? days.length : null;
      })();

      const resolvedShootingDays =
        existingBudget?.shootingDays ??
        scheduledDayCount ??
        estimateShootingDays(
          rows.reduce(
            (max, r) =>
              Math.max(max, ...r.scenesPresent.map((s) => s.sceneNumber)),
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
      const result = await ResultAsync.fromPromise(
        (async () => {
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
                projectId: data.projectId,
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

          // 2. Compute schedule-based day counts for per-element lines (locations, vehicles)
          const scheduleDataForLines = await (async () => {
            const schedule = await db.query.schedules.findFirst({
              where: eq(schedules.projectId, data.projectId),
            });
            if (!schedule) return null;
            const stripRows = await db
              .select({
                shootingDayId: strips.shootingDayId,
                sceneId: strips.sceneId,
              })
              .from(strips)
              .where(eq(strips.scheduleId, schedule.id));
            // map sceneId → set of shootingDayIds
            const sceneTodays = new Map<string, Set<string>>();
            for (const s of stripRows) {
              if (!s.shootingDayId) continue;
              const set = sceneTodays.get(s.sceneId) ?? new Set();
              set.add(s.shootingDayId);
              sceneTodays.set(s.sceneId, set);
            }
            return { sceneTodays };
          })();

          // 3. Upsert per-element lines (locations, vehicles), preserving actual
          for (const line of perElement) {
            let qty = line.quantity;
            if (scheduleDataForLines && line.linkedElementId) {
              const occurrences = await db
                .select({ sceneId: breakdownOccurrences.sceneId })
                .from(breakdownOccurrences)
                .where(
                  eq(breakdownOccurrences.elementId, line.linkedElementId),
                );
              const daySet = new Set<string>();
              for (const occ of occurrences) {
                const days = scheduleDataForLines.sceneTodays.get(occ.sceneId);
                if (days) for (const d of days) daySet.add(d);
              }
              qty = daySet.size > 0 ? daySet.size : line.quantity;
            }

            const existing = await db.query.budgetLines.findFirst({
              where: and(
                eq(budgetLines.budgetId, budgetId),
                eq(budgetLines.linkedElementId, line.linkedElementId!),
              ),
            });
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

          // 4. Upsert aggregate lines (one per collapsed category key), preserving actual
          for (const line of aggregate) {
            const existing = await db.query.budgetLines.findFirst({
              where: and(
                eq(budgetLines.budgetId, budgetId),
                eq(budgetLines.linkedCategory, line.linkedCategory!),
                isNull(budgetLines.linkedElementId),
              ),
            });
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
            where: eq(projectRateCard.projectId, data.projectId),
          });
          const rateByName = new Map(
            rateCardRows.map((r) => [r.name.toLowerCase(), r]),
          );

          // Populate cast from breakdown cast elements
          await db.delete(budgetCast).where(eq(budgetCast.budgetId, budgetId));
          const castRows = rows.filter((r) => r.element.category === "cast");
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
                  fiscalRegime: (rate?.fiscalRegime ?? "piva") as FiscalRegime,
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

          return loadBudgetWithLines(db, data.projectId);
        })(),
        (e) => new DbError("generateBudget/persist", e),
      );

      if (result.isErr()) return toShape(err(result.error));
      if (!result.value)
        return toShape(
          err(new DbError("generateBudget", "budget missing after insert")),
        );
      return toShape(ok(result.value));
    },
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
        BudgetLineNotFoundError | BudgetLockedError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const line = await db.query.budgetLines.findFirst({
        where: eq(budgetLines.id, data.lineId),
      });
      if (!line) return toShape(err(new BudgetLineNotFoundError(data.lineId)));

      const budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, line.budgetId),
      });
      if (!budget)
        return toShape(err(new DbError("updateBudgetLine", "budget missing")));

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        budget.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("edit budget line")));
      if (budget.status === "locked")
        return toShape(err(new BudgetLockedError()));

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (data.patch.actual !== undefined)
        set.actual =
          data.patch.actual !== null ? String(data.patch.actual) : null;
      if (data.patch.rate !== undefined)
        set.rate = data.patch.rate !== null ? String(data.patch.rate) : null;
      if (data.patch.quantity !== undefined)
        set.quantity =
          data.patch.quantity !== null ? String(data.patch.quantity) : null;
      if (data.patch.notes !== undefined) set.notes = data.patch.notes;

      const result = await ResultAsync.fromPromise(
        db
          .update(budgetLines)
          .set(set)
          .where(eq(budgetLines.id, data.lineId))
          .returning()
          .then(([r]) => parseLine(r!)),
        (e) => new DbError("updateBudgetLine", e),
      );
      return toShape(result);
    },
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
        BudgetNotFoundError | BudgetLockedError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, data.budgetId),
      });
      if (!budget) return toShape(err(new BudgetNotFoundError(data.budgetId)));
      if (budget.status === "locked")
        return toShape(err(new BudgetLockedError()));

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        budget.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("edit budget settings")));

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (data.shootingDays !== undefined) set.shootingDays = data.shootingDays;
      if (data.contingencyPercent !== undefined)
        set.contingencyPercent = String(data.contingencyPercent);

      const result = await ResultAsync.fromPromise(
        db
          .update(budgets)
          .set(set)
          .where(eq(budgets.id, data.budgetId))
          .then(() => loadBudgetWithLines(db, budget.projectId)),
        (e) => new DbError("updateBudgetSettings", e),
      ).andThen((updated) =>
        updated
          ? ok(updated)
          : err(new DbError("updateBudgetSettings", "reload failed")),
      );
      return toShape(result);
    },
  );

// ─── getBudgetSummary ─────────────────────────────────────────────────────────

export const getBudgetSummary = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<BudgetSummary | null, ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canView(access.value))
        return toShape(err(new ForbiddenError("view budget")));

      const result = await ResultAsync.fromPromise(
        (async () => {
          const budget = await loadBudgetWithLines(db, data.projectId);
          if (!budget) return null;
          return computeBudgetSummary(budget.lines, budget.contingencyPercent);
        })(),
        (e) => new DbError("getBudgetSummary", e),
      );

      return toShape(result);
    },
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
        ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canView(access.value))
        return toShape(err(new ForbiddenError("view budget")));

      const result = await ResultAsync.fromPromise(
        (async () => {
          const budget = await db.query.budgets.findFirst({
            where: eq(budgets.projectId, data.projectId),
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
              .innerJoin(scenes, eq(breakdownOccurrences.sceneId, scenes.id))
              .where(eq(breakdownOccurrences.elementId, row.elementId));
            castSceneMap[row.id] = [
              ...new Set(occurrences.map((o) => o.sceneNumber)),
            ].sort((a, b) => a - b);
          }

          return { cast, crew, castSceneMap };
        })(),
        (e) => new DbError("getCastAndCrew", e),
      );

      return toShape(result);
    },
  );

// ─── getProjectScenes ─────────────────────────────────────────────────────────

export type SceneChip = { number: number; heading: string };

export const getProjectScenes = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<SceneChip[], ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canView(access.value))
        return toShape(err(new ForbiddenError("view budget")));

      const result = await ResultAsync.fromPromise(
        (async () => {
          const screenplay = await db.query.screenplays.findFirst({
            where: eq(screenplays.projectId, data.projectId),
          });
          if (!screenplay?.currentVersionId) return [];

          const rows = await db
            .select({ number: scenes.number, heading: scenes.heading })
            .from(scenes)
            .where(eq(scenes.screenplayId, screenplay.id))
            .orderBy(scenes.number);
          return rows;
        })(),
        (e) => new DbError("getProjectScenes", e),
      );

      return toShape(result);
    },
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
      ResultShape<BudgetCast, BudgetLockedError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const row = await db.query.budgetCast.findFirst({
        where: eq(budgetCast.id, data.rowId),
      });
      if (!row)
        return toShape(
          err(new DbError("updateBudgetCastRow", "cast row not found")),
        );

      const budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, row.budgetId),
      });
      if (!budget)
        return toShape(
          err(new DbError("updateBudgetCastRow", "budget missing")),
        );
      if (budget.status === "locked")
        return toShape(err(new BudgetLockedError()));

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        budget.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("edit cast row")));

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (data.patch.days !== undefined) set.days = String(data.patch.days);
      if (data.patch.dayRate !== undefined)
        set.dayRate = String(data.patch.dayRate);
      if (data.patch.fiscalRegime !== undefined)
        set.fiscalRegime = data.patch.fiscalRegime;
      if (data.patch.mealAllowance !== undefined)
        set.mealAllowance = String(data.patch.mealAllowance);
      if (data.patch.accommodation !== undefined)
        set.accommodation = String(data.patch.accommodation);

      const result = await ResultAsync.fromPromise(
        db
          .update(budgetCast)
          .set(set)
          .where(eq(budgetCast.id, data.rowId))
          .returning()
          .then(([r]) => r!),
        (e) => new DbError("updateBudgetCastRow", e),
      );
      return toShape(result);
    },
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
      ResultShape<BudgetCrew, BudgetLockedError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const row = await db.query.budgetCrew.findFirst({
        where: eq(budgetCrew.id, data.rowId),
      });
      if (!row)
        return toShape(
          err(new DbError("updateBudgetCrewRow", "crew row not found")),
        );

      const budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, row.budgetId),
      });
      if (!budget)
        return toShape(
          err(new DbError("updateBudgetCrewRow", "budget missing")),
        );
      if (budget.status === "locked")
        return toShape(err(new BudgetLockedError()));

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        budget.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("edit crew row")));

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (data.patch.days !== undefined) set.days = String(data.patch.days);
      if (data.patch.dayRate !== undefined)
        set.dayRate = String(data.patch.dayRate);
      if (data.patch.fiscalRegime !== undefined)
        set.fiscalRegime = data.patch.fiscalRegime;
      if (data.patch.mealAllowance !== undefined)
        set.mealAllowance = String(data.patch.mealAllowance);
      if (data.patch.accommodation !== undefined)
        set.accommodation = String(data.patch.accommodation);
      if (data.patch.enabled !== undefined) set.enabled = data.patch.enabled;

      const result = await ResultAsync.fromPromise(
        db
          .update(budgetCrew)
          .set(set)
          .where(eq(budgetCrew.id, data.rowId))
          .returning()
          .then(([r]) => r!),
        (e) => new DbError("updateBudgetCrewRow", e),
      );
      return toShape(result);
    },
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
      ResultShape<BudgetCrew, BudgetLockedError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, data.budgetId),
      });
      if (!budget)
        return toShape(
          err(new DbError("addBudgetCrewRow", "budget not found")),
        );
      if (budget.status === "locked")
        return toShape(err(new BudgetLockedError()));

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        budget.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("add crew row")));

      const result = await ResultAsync.fromPromise(
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
      return toShape(result);
    },
  );

// ─── removeBudgetCrewRow ──────────────────────────────────────────────────────

export const removeBudgetCrewRow = createServerFn({ method: "POST" })
  .validator(z.object({ rowId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<{ id: string }, BudgetLockedError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const row = await db.query.budgetCrew.findFirst({
        where: eq(budgetCrew.id, data.rowId),
      });
      if (!row)
        return toShape(
          err(new DbError("removeBudgetCrewRow", "crew row not found")),
        );

      const budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, row.budgetId),
      });
      if (!budget)
        return toShape(
          err(new DbError("removeBudgetCrewRow", "budget missing")),
        );
      if (budget.status === "locked")
        return toShape(err(new BudgetLockedError()));

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        budget.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("remove crew row")));

      const result = await ResultAsync.fromPromise(
        db
          .delete(budgetCrew)
          .where(eq(budgetCrew.id, data.rowId))
          .then(() => ({ id: data.rowId })),
        (e) => new DbError("removeBudgetCrewRow", e),
      );
      return toShape(result);
    },
  );

// ─── getRateCard ──────────────────────────────────────────────────────────────

export const getRateCard = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ProjectRateCard[], ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));

      const result = await ResultAsync.fromPromise(
        db.query.projectRateCard.findMany({
          where: eq(projectRateCard.projectId, data.projectId),
          orderBy: (t, { asc }) => asc(t.sortOrder),
        }),
        (e) => new DbError("getRateCard", e),
      );
      return toShape(result);
    },
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
    }): Promise<ResultShape<ProjectRateCard, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        data.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("edit rate card")));

      const result = await ResultAsync.fromPromise(
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
            .findMany({ where: eq(projectRateCard.projectId, data.projectId) })
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
      );
      return toShape(result);
    },
  );

// ─── deleteRateEntry ──────────────────────────────────────────────────────────

export const deleteRateEntry = createServerFn({ method: "POST" })
  .validator(z.object({ entryId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ id: string }, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const entry = await db.query.projectRateCard.findFirst({
        where: eq(projectRateCard.id, data.entryId),
      });
      if (!entry)
        return toShape(err(new DbError("deleteRateEntry", "entry not found")));

      const access = await resolveBudgetAccessByProjectId(
        db,
        user.id,
        entry.projectId,
      );
      if (access.isErr()) return toShape(err(access.error));
      if (!canEdit(access.value))
        return toShape(err(new ForbiddenError("delete rate entry")));

      const result = await ResultAsync.fromPromise(
        db
          .delete(projectRateCard)
          .where(eq(projectRateCard.id, data.entryId))
          .then(() => ({ id: data.entryId })),
        (e) => new DbError("deleteRateEntry", e),
      );
      return toShape(result);
    },
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
