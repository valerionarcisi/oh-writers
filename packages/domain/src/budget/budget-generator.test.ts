import { describe, it, expect } from "vitest";
import {
  estimateShootingDays,
  generateBudgetLines,
  lineEffectiveTotal,
  computeBudgetSummary,
} from "./budget-generator.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeRow = (
  overrides: Partial<{
    id: string;
    name: string;
    category: string;
    castTier: string | null;
    totalQuantity: number;
    scenesPresent: { sceneId: string }[];
  }> = {},
) => ({
  element: {
    id: overrides.id ?? "00000000-0000-0000-0000-000000000001",
    name: overrides.name ?? "Element",
    category: overrides.category ?? "props",
    castTier: overrides.castTier ?? null,
  },
  totalQuantity: overrides.totalQuantity ?? 1,
  scenesPresent: overrides.scenesPresent ?? [{ sceneId: "s1" }],
});

// ─── estimateShootingDays ─────────────────────────────────────────────────────

describe("estimateShootingDays", () => {
  it("uses 0.8 ratio for feature", () => {
    expect(estimateShootingDays(10, "feature")).toBe(8);
  });

  it("uses 0.5 ratio for short", () => {
    expect(estimateShootingDays(10, "short")).toBe(5);
  });

  it("returns at least 1 for very short scripts", () => {
    expect(estimateShootingDays(0, "feature")).toBe(1);
    expect(estimateShootingDays(1, "short")).toBe(1);
  });
});

// ─── generateBudgetLines ─────────────────────────────────────────────────────

describe("generateBudgetLines", () => {
  it("generates one line per breakdown row", () => {
    const rows = [
      makeRow({ category: "cast", name: "Filippo" }),
      makeRow({ category: "locations", name: "Angolo" }),
      makeRow({ category: "props", name: "Pistola" }),
    ];
    const lines = generateBudgetLines({ rows, shootingDays: 10 });
    expect(lines).toHaveLength(3);
  });

  it("cast daily quantity = shootingDays", () => {
    const rows = [makeRow({ category: "cast", name: "Hero" })];
    const lines = generateBudgetLines({ rows, shootingDays: 12 });
    expect(lines[0]!.quantity).toBe(12);
    expect(lines[0]!.costType).toBe("daily");
  });

  it("props unit quantity = totalQuantity", () => {
    const rows = [makeRow({ category: "props", totalQuantity: 7 })];
    const lines = generateBudgetLines({ rows, shootingDays: 5 });
    expect(lines[0]!.quantity).toBe(7);
    expect(lines[0]!.costType).toBe("unit");
  });

  it("extras quantity = totalQuantity × shootingDays", () => {
    const rows = [makeRow({ category: "extras", totalQuantity: 3 })];
    const lines = generateBudgetLines({ rows, shootingDays: 4 });
    expect(lines[0]!.quantity).toBe(12);
  });

  it("vfx quantity = number of scenes with that element", () => {
    const rows = [
      makeRow({
        category: "vfx",
        scenesPresent: [
          { sceneId: "s1" },
          { sceneId: "s2" },
          { sceneId: "s3" },
        ],
      }),
    ];
    const lines = generateBudgetLines({ rows, shootingDays: 10 });
    expect(lines[0]!.quantity).toBe(3);
  });

  it("cast supporting tier uses lower rate", () => {
    const principal = makeRow({ category: "cast", castTier: "principal" });
    const supporting = makeRow({ category: "cast", castTier: "supporting" });
    const [lp] = generateBudgetLines({ rows: [principal], shootingDays: 1 });
    const [ls] = generateBudgetLines({ rows: [supporting], shootingDays: 1 });
    expect(lp!.rate).toBeGreaterThan(ls!.rate);
  });

  it("day_player rate = supporting × 0.6", () => {
    const supporting = makeRow({ category: "cast", castTier: "supporting" });
    const dayPlayer = makeRow({ category: "cast", castTier: "day_player" });
    const [ls] = generateBudgetLines({ rows: [supporting], shootingDays: 1 });
    const [ld] = generateBudgetLines({ rows: [dayPlayer], shootingDays: 1 });
    expect(ld!.rate).toBeCloseTo(ls!.rate * 0.6);
  });

  it("rate overrides replace defaults", () => {
    const rows = [makeRow({ category: "props" })];
    const lines = generateBudgetLines(
      { rows, shootingDays: 5 },
      { props_unit: 999 },
    );
    expect(lines[0]!.rate).toBe(999);
  });

  it("empty breakdown produces no lines", () => {
    expect(generateBudgetLines({ rows: [], shootingDays: 5 })).toHaveLength(0);
  });

  it("cast is above_the_line, props is production", () => {
    const rows = [
      makeRow({ category: "cast" }),
      makeRow({ category: "props" }),
    ];
    const lines = generateBudgetLines({ rows, shootingDays: 5 });
    const cast = lines.find((l) => l.linkedCategory === "cast")!;
    const props = lines.find((l) => l.linkedCategory === "props")!;
    expect(cast.topSheet).toBe("above_the_line");
    expect(props.topSheet).toBe("production");
  });
});

// ─── lineEffectiveTotal ───────────────────────────────────────────────────────

describe("lineEffectiveTotal", () => {
  it("actual wins over rate × quantity", () => {
    expect(
      lineEffectiveTotal({
        costType: "daily",
        quantity: 10,
        rate: 100,
        actual: 500,
      }),
    ).toBe(500);
  });

  it("rate × quantity when actual is null", () => {
    expect(
      lineEffectiveTotal({
        costType: "daily",
        quantity: 10,
        rate: 100,
        actual: null,
      }),
    ).toBe(1000);
  });

  it("flat returns rate regardless of quantity", () => {
    expect(
      lineEffectiveTotal({
        costType: "flat",
        quantity: null,
        rate: 3000,
        actual: null,
      }),
    ).toBe(3000);
  });

  it("percentage returns 0 (handled at summary level)", () => {
    expect(
      lineEffectiveTotal({
        costType: "percentage",
        quantity: null,
        rate: null,
        actual: null,
      }),
    ).toBe(0);
  });
});

// ─── computeBudgetSummary ─────────────────────────────────────────────────────

describe("computeBudgetSummary", () => {
  it("sums by top sheet and adds contingency", () => {
    const lines = [
      {
        topSheet: "above_the_line" as const,
        costType: "flat" as const,
        quantity: null,
        rate: 1000,
        actual: null,
      },
      {
        topSheet: "production" as const,
        costType: "unit" as const,
        quantity: 2,
        rate: 500,
        actual: null,
      },
    ];
    const summary = computeBudgetSummary(lines, 10);
    expect(summary.aboveTheLine).toBe(1000);
    expect(summary.production).toBe(1000);
    expect(summary.subtotal).toBe(2000);
    expect(summary.contingency).toBe(200);
    expect(summary.grandTotal).toBe(2200);
  });

  it("uses actual when set", () => {
    const lines = [
      {
        topSheet: "production" as const,
        costType: "daily" as const,
        quantity: 10,
        rate: 100,
        actual: 50,
      },
    ];
    const summary = computeBudgetSummary(lines, 0);
    expect(summary.production).toBe(50);
  });
});
