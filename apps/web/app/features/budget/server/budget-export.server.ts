import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import {
  budgets,
  budgetLines,
  budgetCast,
  budgetCrew,
} from "@oh-writers/db/schema";
import { BudgetLineSchema } from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import { DbError, ForbiddenError } from "../budget.errors";
import { ProjectNotFoundError } from "~/features/projects";
import { budgetSectionsToCsv } from "../lib/budget-export-csv";
import { buildBudgetPdfFromSections } from "../lib/budget-export-pdf";
import { buildFlatSections, type FlatSection } from "../lib/flat-sections";

const ExportInput = z.object({ projectId: z.string().uuid() });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isoDate = () => new Date().toISOString().slice(0, 10);

// The Breakdown occasionally files a slugline token (INT./EXT./EST.) as a cast
// member. The screen filters those out, so the export must too — otherwise the
// two disagree on the cast list.
const SLUGLINE_PREFIX = /^(INT|EXT|EST|I\/E|INT\/EXT)\.?\b/i;

/** Loads every budget row the screen shows and folds it through the same
 *  aggregation. Both exports go through here, so a CSV, a PDF and the page can
 *  never report different money. */
const loadBudgetSections = async (
  db: Parameters<Parameters<typeof withProjectAccess>[2]>[0]["db"],
  projectId: string,
): Promise<FlatSection[]> => {
  const budget = await db.query.budgets.findFirst({
    where: eq(budgets.projectId, projectId),
  });
  if (!budget) return [];

  const [rawLines, rawCast, crew] = await Promise.all([
    db.query.budgetLines.findMany({
      where: eq(budgetLines.budgetId, budget.id),
      orderBy: (t) => t.sortOrder,
    }),
    db.query.budgetCast.findMany({
      where: eq(budgetCast.budgetId, budget.id),
      orderBy: (t) => t.sortOrder,
    }),
    db.query.budgetCrew.findMany({
      where: eq(budgetCrew.budgetId, budget.id),
      orderBy: (t) => t.sortOrder,
    }),
  ]);

  const lines = rawLines.map((row) =>
    BudgetLineSchema.parse({
      ...row,
      quantity: row.quantity !== null ? Number(row.quantity) : null,
      rate: row.rate !== null ? Number(row.rate) : null,
      actual: row.actual !== null ? Number(row.actual) : null,
    }),
  );

  return buildFlatSections({
    lines,
    cast: rawCast.filter((r) => !SLUGLINE_PREFIX.test(r.name)),
    crew,
  });
};

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
            (async () => ({
              csv: budgetSectionsToCsv(
                await loadBudgetSections(db, project.id),
              ),
              filename: `${project.slug}-budget-${isoDate()}.csv`,
            }))(),
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
              const date = isoDate();
              const buf = await buildBudgetPdfFromSections(
                project.title,
                await loadBudgetSections(db, project.id),
                date,
              );
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
