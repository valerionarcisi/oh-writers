import { describe, it, expect } from "vitest";
import {
  findExcessiveLines,
  evaluateAgainstCap,
  proposeMissingLines,
  type IntelligenceLine,
} from "./cesare-budget-intelligence";

const line = (
  id: string,
  category: string,
  amount: number,
): IntelligenceLine => ({
  id,
  name: `Line ${id}`,
  category,
  amountEuros: amount,
});

describe("findExcessiveLines", () => {
  it("returns nothing for an empty list", () => {
    expect(findExcessiveLines([])).toEqual([]);
  });

  it("ignores categories with a single line", () => {
    expect(findExcessiveLines([line("a", "props", 10_000)])).toEqual([]);
  });

  it("flags a line >=150% of the category mean", () => {
    const out = findExcessiveLines([
      line("a", "props", 100),
      line("b", "props", 100),
      line("c", "props", 400),
    ]);
    // mean = 200, line c = 2x mean
    expect(out).toHaveLength(1);
    expect(out[0]!.lineId).toBe("c");
    expect(out[0]!.ratio).toBeCloseTo(2);
  });

  it("does not flag lines just below the threshold", () => {
    const out = findExcessiveLines(
      [
        line("a", "props", 100),
        line("b", "props", 100),
        line("c", "props", 140),
      ],
      1.5,
    );
    expect(out).toEqual([]);
  });

  it("flags only within the same category", () => {
    const out = findExcessiveLines([
      line("a", "props", 100),
      line("b", "props", 100),
      line("c", "wardrobe", 10_000),
    ]);
    // wardrobe has only 1 line — skipped; props balanced — no flag
    expect(out).toEqual([]);
  });

  it("ranks flagged lines from most to least extreme", () => {
    const out = findExcessiveLines([
      line("a", "props", 100),
      line("b", "props", 100),
      line("c", "props", 300),
      line("d", "props", 600),
    ]);
    // mean = (100+100+300+600)/4 = 275 → 300 above 1.5x? 300/275=1.09 (no), 600/275=2.18 (yes)
    expect(out.map((o) => o.lineId)).toEqual(["d"]);
  });
});

describe("evaluateAgainstCap", () => {
  it("returns null cap when no global cap is set", () => {
    const out = evaluateAgainstCap(
      [],
      [{ topSheet: "production", usedCents: 500_000 }],
    );
    expect(out.globalCapCents).toBeNull();
    expect(out.globalUsedCents).toBe(500_000);
    expect(out.globalResidualCents).toBeNull();
    expect(out.isOverGlobal).toBe(false);
    expect(out.byTopSheet).toEqual([]);
  });

  it("computes global residual when only a global cap is present", () => {
    const out = evaluateAgainstCap(
      [{ topSheet: null, amountCents: 5_000_000 }],
      [
        { topSheet: "production", usedCents: 3_000_000 },
        { topSheet: "crew", usedCents: 1_000_000 },
      ],
    );
    expect(out.globalCapCents).toBe(5_000_000);
    expect(out.globalUsedCents).toBe(4_000_000);
    expect(out.globalResidualCents).toBe(1_000_000);
    expect(out.isOverGlobal).toBe(false);
  });

  it("flags overspend when used > cap", () => {
    const out = evaluateAgainstCap(
      [{ topSheet: null, amountCents: 1_000_000 }],
      [{ topSheet: "production", usedCents: 1_500_000 }],
    );
    expect(out.isOverGlobal).toBe(true);
    expect(out.globalResidualCents).toBe(-500_000);
  });

  it("evaluates per-topsheet caps independently", () => {
    const out = evaluateAgainstCap(
      [
        { topSheet: "production", amountCents: 2_000_000 },
        { topSheet: "crew", amountCents: 1_000_000 },
      ],
      [
        { topSheet: "production", usedCents: 1_500_000 },
        { topSheet: "crew", usedCents: 1_200_000 },
      ],
    );
    expect(out.byTopSheet).toHaveLength(2);
    expect(out.overspendingTopSheets).toEqual(["crew"]);
    const productionEval = out.byTopSheet.find(
      (b) => b.topSheet === "production",
    )!;
    expect(productionEval.residualCents).toBe(500_000);
  });

  it("treats missing topsheet spend as 0 used", () => {
    const out = evaluateAgainstCap(
      [{ topSheet: "production", amountCents: 1_000_000 }],
      [],
    );
    expect(out.byTopSheet[0]!.usedCents).toBe(0);
    expect(out.byTopSheet[0]!.residualCents).toBe(1_000_000);
  });
});

describe("proposeMissingLines", () => {
  it("returns nothing when every category is already covered", () => {
    expect(
      proposeMissingLines(["props", "wardrobe"], ["props", "wardrobe"]),
    ).toEqual([]);
  });

  it("flags categories present in scenes but missing from the budget", () => {
    const out = proposeMissingLines(["props", "vfx"], ["props"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.category).toBe("vfx");
    expect(out[0]!.suggestedName).toBe("VFX");
  });

  it("deduplicates repeated categories", () => {
    const out = proposeMissingLines(["props", "props", "props"], []);
    expect(out).toHaveLength(1);
  });
});
