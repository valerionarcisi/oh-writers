import { describe, it, expect } from "vitest";
import {
  CAST_TIERS,
  CAST_TIER_META,
  CAST_TIER_ORDER,
  CastTierSchema,
} from "./index.js";

describe("cast tiers", () => {
  it("has exactly 4 tiers", () => {
    expect(CAST_TIERS).toHaveLength(4);
  });

  it("CAST_TIER_META has IT and EN labels for every tier", () => {
    for (const t of CAST_TIERS) {
      const meta = CAST_TIER_META[t];
      expect(meta).toBeDefined();
      expect(meta.id).toBe(t);
      expect(meta.labelIt.length).toBeGreaterThan(0);
      expect(meta.labelEn.length).toBeGreaterThan(0);
    }
  });

  it("CAST_TIER_ORDER includes every tier exactly once", () => {
    expect([...CAST_TIER_ORDER].sort()).toEqual([...CAST_TIERS].sort());
  });

  it("CAST_TIER_ORDER starts with principal", () => {
    expect(CAST_TIER_ORDER[0]).toBe("principal");
  });

  it("CastTierSchema accepts every valid tier", () => {
    for (const t of CAST_TIERS) {
      expect(CastTierSchema.safeParse(t).success).toBe(true);
    }
  });

  it("CastTierSchema rejects unknown values", () => {
    expect(CastTierSchema.safeParse("lead").success).toBe(false);
    expect(CastTierSchema.safeParse("").success).toBe(false);
    expect(CastTierSchema.safeParse(null).success).toBe(false);
  });
});
