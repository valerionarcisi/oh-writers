import type { BudgetLine } from "@oh-writers/domain";

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

const escapeCsv = (s: string): string =>
  /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

const formatAmount = (v: number | null): string =>
  v === null ? "" : v.toFixed(2);

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

export const budgetLinesToCsv = (lines: BudgetLine[]): string => {
  const header = [
    "Category",
    "Line Item",
    "Amount (EUR)",
    "Actual (EUR)",
    "Notes",
  ].join(",");

  const rows = buildBudgetCsvRows(lines);
  const dataRows = rows.map((r) =>
    [
      escapeCsv(r.category),
      escapeCsv(r.name),
      formatAmount(r.estimatedAmount),
      formatAmount(r.actualAmount),
      escapeCsv(r.notes ?? ""),
    ].join(","),
  );

  const grandTotal = rows.reduce((sum, r) => sum + r.estimatedAmount, 0);
  const totalRow = [
    escapeCsv("TOTAL"),
    "",
    formatAmount(grandTotal),
    "",
    "",
  ].join(",");

  return [header, ...dataRows, totalRow].join("\n");
};
