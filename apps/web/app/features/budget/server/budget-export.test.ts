import { describe, it, expect } from "vitest";
import {
  budgetLinesToCsv,
  buildBudgetCsvRows,
  budgetSectionsToCsv,
} from "../lib/budget-export-csv";
import { buildFlatSections, grandTotalOf } from "../lib/flat-sections";
import type { BudgetLine } from "@oh-writers/domain";
import type { BudgetCast, BudgetCrew } from "@oh-writers/db/schema";

const makeLine = (overrides: Partial<BudgetLine> = {}): BudgetLine => ({
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
    const rows = buildBudgetCsvRows([makeLine({ quantity: 3, rate: 1500 })]);
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

// #66 — the export used to read budget_lines only, so a film whose cost is
// mostly people exported a total of ~0 while the screen showed the real number.
describe("budgetSectionsToCsv — the export agrees with the screen", () => {
  const cast: BudgetCast = {
    id: "cast-1",
    budgetId: "b-1",
    elementId: null,
    name: "Marco",
    days: "10",
    dayRate: "300",
    rateUnit: "giornata",
    fiscalRegime: "piva",
    mealAllowance: "0",
    accommodation: "0",
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const crew: BudgetCrew = {
    id: "crew-1",
    budgetId: "b-1",
    roleKey: null,
    name: "Direttore fotografia",
    department: "fotografia",
    days: "8",
    dayRate: "250",
    rateUnit: "giornata",
    fiscalRegime: "piva",
    mealAllowance: "0",
    accommodation: "0",
    enabled: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sectionsOf = (lines: BudgetLine[]) =>
    buildFlatSections({ lines, cast: [cast], crew: [crew] });

  it("carries Cast and Crew rows into the CSV", () => {
    const csv = budgetSectionsToCsv(sectionsOf([]));
    expect(csv).toContain("Marco");
    expect(csv).toContain("Direttore fotografia");
    expect(csv).toContain("Cast");
    expect(csv).toContain("Troupe");
  });

  it("totals to exactly what the screen totals", () => {
    const lines = [makeLine({ quantity: 1, rate: 2000 })];
    const sections = sectionsOf(lines);
    const csv = budgetSectionsToCsv(sections);
    const exported = Number(csv.split("\n").at(-1)!.split(",")[2]);

    // Same aggregation the page renders — not a re-derivation that can drift.
    expect(exported).toBe(grandTotalOf(sections));
    // And it is the real money, not the ~2000 a lines-only export would give:
    // cast + crew carry most of the cost (net of the fiscal regime).
    expect(exported).toBe(7_000);
  });

  it("keeps a disabled crew member at zero, as the screen does", () => {
    const sections = buildFlatSections({
      lines: [],
      cast: [],
      crew: [{ ...crew, enabled: false }],
    });
    expect(grandTotalOf(sections)).toBe(0);
    expect(budgetSectionsToCsv(sections)).toContain("Direttore fotografia");
  });
});
