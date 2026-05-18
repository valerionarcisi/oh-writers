import { describe, it, expect } from "vitest";
import { budgetLinesToCsv, buildBudgetCsvRows } from "../lib/budget-export-csv";
import type { BudgetLine } from "@oh-writers/domain";

const makeLine = (
  overrides: Partial<BudgetLine> = {},
): BudgetLine => ({
  id: "00000000-0000-0000-0000-000000000001",
  budgetId: "00000000-0000-0000-0000-000000000002",
  topSheet: "above_the_line",
  name: "Director fee",
  costType: "flat",
  quantity: 1,
  rate: 5000,
  actual: null,
  notes: null,
  linkedElementId: null,
  linkedCategory: null,
  sortOrder: 0,
  ...overrides,
});

describe("buildBudgetCsvRows", () => {
  it("maps topSheet to human-readable category", () => {
    const rows = buildBudgetCsvRows([makeLine({ topSheet: "above_the_line" })]);
    expect(rows[0]?.category).toBe("Above the Line");
  });

  it("maps all known topSheet values", () => {
    const topSheets = [
      "above_the_line",
      "production",
      "crew",
      "post_production",
      "contingency",
    ] as const;
    for (const topSheet of topSheets) {
      const rows = buildBudgetCsvRows([makeLine({ topSheet })]);
      expect(rows[0]?.category).not.toBe(topSheet);
    }
  });

  it("computes estimated amount as quantity * rate", () => {
    const rows = buildBudgetCsvRows([
      makeLine({ quantity: 3, rate: 1500 }),
    ]);
    expect(rows[0]?.estimatedAmount).toBe(4500);
  });

  it("returns 0 when quantity is null", () => {
    const rows = buildBudgetCsvRows([makeLine({ quantity: null })]);
    expect(rows[0]?.estimatedAmount).toBe(0);
  });

  it("returns 0 when rate is null", () => {
    const rows = buildBudgetCsvRows([makeLine({ rate: null })]);
    expect(rows[0]?.estimatedAmount).toBe(0);
  });

  it("preserves actual amount", () => {
    const rows = buildBudgetCsvRows([makeLine({ actual: 4800 })]);
    expect(rows[0]?.actualAmount).toBe(4800);
  });

  it("preserves notes", () => {
    const rows = buildBudgetCsvRows([makeLine({ notes: "including bonus" })]);
    expect(rows[0]?.notes).toBe("including bonus");
  });
});

describe("budgetLinesToCsv", () => {
  it("outputs a header row", () => {
    const csv = budgetLinesToCsv([]);
    const header = csv.split("\n")[0];
    expect(header).toBe("Category,Line Item,Amount (EUR),Actual (EUR),Notes");
  });

  it("outputs a TOTAL row at the end", () => {
    const csv = budgetLinesToCsv([makeLine({ quantity: 1, rate: 5000 })]);
    const lastRow = csv.split("\n").at(-1)!;
    expect(lastRow).toContain("TOTAL");
    expect(lastRow).toContain("5000.00");
  });

  it("includes one data row per line", () => {
    const lines = [makeLine(), makeLine({ name: "Script", sortOrder: 1 })];
    const csv = budgetLinesToCsv(lines);
    const rows = csv.split("\n");
    // header + 2 data rows + TOTAL
    expect(rows).toHaveLength(4);
  });

  it("escapes commas in line item names", () => {
    const csv = budgetLinesToCsv([makeLine({ name: "Fee, flat" })]);
    expect(csv).toContain('"Fee, flat"');
  });

  it("escapes double-quotes in names", () => {
    const csv = budgetLinesToCsv([makeLine({ name: 'Say "hello"' })]);
    expect(csv).toContain('"Say ""hello"""');
  });

  it("sums grand total from all lines", () => {
    const lines = [
      makeLine({ quantity: 1, rate: 2000 }),
      makeLine({ quantity: 2, rate: 1500, topSheet: "crew", name: "DP" }),
    ];
    const csv = budgetLinesToCsv(lines);
    const totalRow = csv.split("\n").at(-1)!;
    expect(totalRow).toContain("5000.00");
  });

  it("handles empty line list with only header and total", () => {
    const csv = budgetLinesToCsv([]);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("TOTAL");
    expect(rows[1]).toContain("0.00");
  });
});
