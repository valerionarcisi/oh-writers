import { describe, it, expect } from "vitest";
import { computeDayCosts } from "./budget-helpers";
import type { DayCostInput } from "./budget-helpers";

const baseInput: DayCostInput = {
  days: [
    { id: "day-1", dayNumber: 1, date: null, sceneIds: ["sc-1", "sc-2"] },
    { id: "day-2", dayNumber: 2, date: null, sceneIds: ["sc-3"] },
  ],
  totalShootingDays: 2,
  contingencyPercent: 10,
  castCostsByScene: {
    "sc-1": 1000,
    "sc-2": 500,
    "sc-3": 800,
  },
  totalCrewCost: 2000,
  perElementLineCosts: [
    { linkedCategory: "locations", sceneIds: ["sc-1"], effectiveTotal: 1200 },
    {
      linkedCategory: "vehicles",
      sceneIds: ["sc-2", "sc-3"],
      effectiveTotal: 400,
    },
  ],
  otherLinesTotalCost: 6000,
};

describe("computeDayCosts", () => {
  it("distributes crew and other costs evenly across days", () => {
    const result = computeDayCosts(baseInput);
    expect(result[0]!.breakdown.crew).toBe(1000);
    expect(result[0]!.breakdown.other).toBe(3000);
    expect(result[1]!.breakdown.crew).toBe(1000);
    expect(result[1]!.breakdown.other).toBe(3000);
  });

  it("assigns cast cost per scene to the day containing that scene", () => {
    const result = computeDayCosts(baseInput);
    expect(result[0]!.breakdown.cast).toBe(1500);
    expect(result[1]!.breakdown.cast).toBe(800);
  });

  it("adds location cost only on days with that location's scenes", () => {
    const result = computeDayCosts(baseInput);
    expect(result[0]!.breakdown.locations).toBe(1200);
    expect(result[1]!.breakdown.locations).toBe(0);
  });

  it("adds vehicle cost on days containing any of its scenes", () => {
    const result = computeDayCosts(baseInput);
    expect(result[0]!.breakdown.vehicles).toBe(400);
    expect(result[1]!.breakdown.vehicles).toBe(400);
  });

  it("applies contingency to each day subtotal", () => {
    const result = computeDayCosts(baseInput);
    const day1Sub = 1500 + 1000 + 1200 + 400 + 3000;
    expect(result[0]!.breakdown.contingency).toBeCloseTo(day1Sub * 0.1);
    expect(result[0]!.total).toBeCloseTo(day1Sub * 1.1);
  });
});
