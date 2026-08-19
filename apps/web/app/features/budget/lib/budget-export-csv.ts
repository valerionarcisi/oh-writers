import type { BudgetLine } from "@oh-writers/domain";
import { toCsv } from "@oh-writers/utils";
import { SECTION_EXPORT_LABEL, type FlatSection } from "./flat-sections";

export interface BudgetCsvRow {
  readonly category: string;
  readonly name: string;
  readonly estimatedAmount: number;
  readonly actualAmount: number | null;
  readonly notes: string | null;
}

const TOP_SHEET_LABELS: Record<string, string> = {
  above_the_line: "Above the Line",
  production: "Production",
  crew: "Crew",
  post_production: "Post-Production",
  contingency: "Contingency",
};

const formatAmount = (v: number | null): string =>
  v === null ? "" : v.toFixed(2);

const rowsToCsv = (rows: ReadonlyArray<BudgetCsvRow>): string => {
  const header = [
    "Category",
    "Line Item",
    "Amount (EUR)",
    "Actual (EUR)",
    "Notes",
  ];

  const dataRows = rows.map((r) => [
    r.category,
    r.name,
    formatAmount(r.estimatedAmount),
    formatAmount(r.actualAmount),
    r.notes ?? "",
  ]);

  const grandTotal = rows.reduce((sum, r) => sum + r.estimatedAmount, 0);
  const totalRow = ["TOTAL", "", formatAmount(grandTotal), "", ""];

  return toCsv(header, [...dataRows, totalRow]);
};

export const buildBudgetCsvRows = (lines: BudgetLine[]): BudgetCsvRow[] =>
  lines.map((line) => ({
    category: TOP_SHEET_LABELS[line.topSheet] ?? line.topSheet,
    name: line.name,
    estimatedAmount:
      line.quantity !== null && line.rate !== null
        ? line.quantity * line.rate
        : 0,
    actualAmount: line.actual,
    notes: line.notes,
  }));

/** Every row the budget shows, Cast and Crew included. `buildFlatSections` is
 *  the one place that knows how a row totals (fiscal regime, meal allowance,
 *  a disabled crew member counting zero), so exports read from it rather than
 *  re-deriving amounts and drifting from the screen. */
export const buildBudgetCsvRowsFromSections = (
  sections: ReadonlyArray<FlatSection>,
): BudgetCsvRow[] =>
  sections.flatMap((section) =>
    section.rows.map((row) => ({
      category: SECTION_EXPORT_LABEL[section.id],
      name: row.name,
      estimatedAmount: row.total,
      actualAmount: row.kind === "line" ? row.actual : null,
      notes: row.kind === "line" ? row.raw.notes : null,
    })),
  );

export const budgetSectionsToCsv = (
  sections: ReadonlyArray<FlatSection>,
): string => rowsToCsv(buildBudgetCsvRowsFromSections(sections));

export const budgetLinesToCsv = (lines: BudgetLine[]): string =>
  rowsToCsv(buildBudgetCsvRows(lines));
