import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import {
  budgets,
  budgetLines,
  budgetRates,
  budgetCast,
  budgetCrew,
  projects,
  screenplays,
  type BudgetCast,
  type BudgetCrew,
} from "@oh-writers/db/schema";
import {
  BudgetSchema,
  BudgetLineSchema,
  estimateShootingDays,
  generateBudgetLines,
  computeBudgetSummary,
  lineEffectiveTotal,
  CREW_ROLES,
  type Budget,
  type BudgetLine,
  type BudgetSummary,
  type RateKey,
  type FiscalRegime,
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

      // resolve shooting days (use existing override if budget already exists)
      const existingBudget = await db.query.budgets.findFirst({
        where: eq(budgets.projectId, data.projectId),
      });
      const shootingDays =
        existingBudget?.shootingDays ??
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
          shootingDays,
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
            await db
              .delete(budgetLines)
              .where(eq(budgetLines.budgetId, budgetId));
          } else {
            const [inserted] = await db
              .insert(budgets)
              .values({
                projectId: data.projectId,
                shootingDays,
                status: "estimated",
                generatedAt: new Date(),
              })
              .returning();
            budgetId = inserted!.id;
          }

          if (generatedLines.length > 0) {
            await db.insert(budgetLines).values(
              generatedLines.map((l) => ({
                budgetId,
                topSheet: l.topSheet,
                name: l.name,
                costType: l.costType,
                quantity: String(l.quantity),
                rate: String(l.rate),
                actual: null,
                notes: null,
                linkedElementId: l.linkedElementId,
                linkedCategory: l.linkedCategory,
                sortOrder: l.sortOrder,
              })),
            );
          }

          // Populate cast from breakdown cast elements
          await db.delete(budgetCast).where(eq(budgetCast.budgetId, budgetId));
          const castRows = rows.filter((r) => r.element.category === "cast");
          if (castRows.length > 0) {
            await db.insert(budgetCast).values(
              castRows.map((r, idx) => ({
                budgetId,
                elementId: r.element.id,
                name: r.element.name,
                days: String(shootingDays),
                dayRate: "0",
                fiscalRegime: "piva" as const,
                mealAllowance: "0",
                accommodation: "0",
                sortOrder: idx,
              })),
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
                days: String(shootingDays),
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

export const getCastAndCrew = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { cast: BudgetCast[]; crew: BudgetCrew[] } | null,
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

          const [cast, crew] = await Promise.all([
            db.query.budgetCast.findMany({
              where: eq(budgetCast.budgetId, budget.id),
              orderBy: (t) => t.sortOrder,
            }),
            db.query.budgetCrew.findMany({
              where: eq(budgetCrew.budgetId, budget.id),
              orderBy: (t) => t.sortOrder,
            }),
          ]);
          return { cast, crew };
        })(),
        (e) => new DbError("getCastAndCrew", e),
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

// ─── queryOptions helpers (client) ───────────────────────────────────────────

export type { Budget, BudgetLine, BudgetSummary, BudgetCast, BudgetCrew };
