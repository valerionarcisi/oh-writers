import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import { budgets, budgetLines } from "@oh-writers/db/schema";
import { BudgetLineSchema } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import { DbError, ForbiddenError } from "../budget.errors";
import { ProjectNotFoundError } from "~/features/projects";
import { budgetLinesToCsv } from "../lib/budget-export-csv";
import { buildBudgetPdf } from "../lib/budget-export-pdf";

const ExportInput = z.object({ projectId: z.string().uuid() });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isoDate = () => new Date().toISOString().slice(0, 10);

// ─── exportBudgetCsv ──────────────────────────────────────────────────────────

export const exportBudgetCsv = createServerFn({ method: "POST" })
  .validator(ExportInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { csv: string; filename: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) => {
          const project = access.project;
          return ResultAsync.fromPromise(
            (async () => {
              const budget = await db.query.budgets.findFirst({
                where: eq(budgets.projectId, project.id),
              });

              if (!budget) {
                return {
                  csv: budgetLinesToCsv([]),
                  filename: `${project.slug}-budget-${isoDate()}.csv`,
                };
              }

              const rawLines = await db.query.budgetLines.findMany({
                where: eq(budgetLines.budgetId, budget.id),
                orderBy: (t) => t.sortOrder,
              });

              const lines = rawLines.map((row) =>
                BudgetLineSchema.parse({
                  ...row,
                  quantity: row.quantity !== null ? Number(row.quantity) : null,
                  rate: row.rate !== null ? Number(row.rate) : null,
                  actual: row.actual !== null ? Number(row.actual) : null,
                }),
              );

              return {
                csv: budgetLinesToCsv(lines),
                filename: `${project.slug}-budget-${isoDate()}.csv`,
              };
            })(),
            (e) => new DbError("exportBudgetCsv", e),
          );
        }),
      ),
  );

// ─── exportBudgetPdf ──────────────────────────────────────────────────────────

export const exportBudgetPdf = createServerFn({ method: "POST" })
  .validator(ExportInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) => {
          const project = access.project;
          return ResultAsync.fromPromise(
            (async () => {
              const budget = await db.query.budgets.findFirst({
                where: eq(budgets.projectId, project.id),
              });

              const rawLines = budget
                ? await db.query.budgetLines.findMany({
                    where: eq(budgetLines.budgetId, budget.id),
                    orderBy: (t) => t.sortOrder,
                  })
                : [];

              const lines = rawLines.map((row) =>
                BudgetLineSchema.parse({
                  ...row,
                  quantity: row.quantity !== null ? Number(row.quantity) : null,
                  rate: row.rate !== null ? Number(row.rate) : null,
                  actual: row.actual !== null ? Number(row.actual) : null,
                }),
              );

              const date = isoDate();
              const buf = await buildBudgetPdf(project.title, lines, date);
              return {
                pdfBase64: buf.toString("base64"),
                filename: `${project.slug}-budget-${date}.pdf`,
              };
            })(),
            (e) => new DbError("exportBudgetPdf", e),
          );
        }),
      ),
  );
