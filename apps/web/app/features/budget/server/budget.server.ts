import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import {
  budgets,
  budgetLines,
  budgetRates,
  projects,
  screenplays,
} from "@oh-writers/db/schema";
import {
  BudgetSchema,
  BudgetLineSchema,
  estimateShootingDays,
  generateBudgetLines,
  computeBudgetSummary,
  lineEffectiveTotal,
  type Budget,
  type BudgetLine,
  type BudgetSummary,
  type RateKey,
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

// ─── queryOptions helpers (client) ───────────────────────────────────────────

export type { Budget, BudgetLine, BudgetSummary };
