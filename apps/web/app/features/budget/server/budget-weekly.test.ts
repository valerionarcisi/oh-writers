import { describe, it, expect } from "vitest";
import {
  aggregateProductionLinesByWeek,
  type WeeklyDayInput,
} from "./budget-helpers";
import type { DayCost } from "./budget-helpers";

const dayCost = (overrides: Partial<DayCost> = {}): DayCost => ({
  dayId: overrides.dayId ?? "day-x",
  dayNumber: overrides.dayNumber ?? 1,
  date: overrides.date ?? null,
  sceneIds: overrides.sceneIds ?? [],
  breakdown: overrides.breakdown ?? {
    cast: 0,
    crew: 0,
    locations: 0,
    vehicles: 0,
    other: 0,
    contingency: 0,
  },
  total: overrides.total ?? 0,
});

const input = (date: string, cost: Partial<DayCost> = {}): WeeklyDayInput => ({
  dayId: cost.dayId ?? `day-${date}`,
  date,
  cost: dayCost({ ...cost, date }),
});

describe("aggregateProductionLinesByWeek", () => {
  it("returns one bucket for a single shoot day", () => {
    // Wednesday — week 1, day 1
    const out = aggregateProductionLinesByWeek([
      input("2026-07-15", {
        total: 1000,
        sceneIds: ["sc-1"],
        breakdown: {
          cast: 500,
          crew: 300,
          locations: 200,
          vehicles: 0,
          other: 0,
          contingency: 0,
        },
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.weekNumber).toBe(1);
    expect(out[0]!.dayCount).toBe(1);
    expect(out[0]!.totalCents).toBe(100_000);
    expect(out[0]!.linesByCategory.cast?.totalCents).toBe(50_000);
    expect(out[0]!.linesByCategory.locations?.totalCents).toBe(20_000);
    expect(out[0]!.sceneIds).toEqual(["sc-1"]);
  });

  it("groups 7 consecutive days starting Monday into one bucket", () => {
    // 2026-07-13 = Monday
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = 13 + i;
      return input(`2026-07-${String(day).padStart(2, "0")}`, {
        total: 1000,
        dayNumber: i + 1,
      });
    });
    const out = aggregateProductionLinesByWeek(days);
    expect(out).toHaveLength(1);
    expect(out[0]!.dayCount).toBe(7);
    expect(out[0]!.totalCents).toBe(700_000);
    expect(out[0]!.startDate).toBe("2026-07-13");
    expect(out[0]!.endDate).toBe("2026-07-19");
  });

  it("splits a 7+1 plan across two ISO weeks", () => {
    // Week of Jul 13 (Mon) -> Jul 19 (Sun). Jul 20 is Mon = new week.
    const days = [
      ...Array.from({ length: 7 }, (_, i) => {
        const day = 13 + i;
        return input(`2026-07-${String(day).padStart(2, "0")}`, { total: 500 });
      }),
      input("2026-07-20", { total: 800 }),
    ];
    const out = aggregateProductionLinesByWeek(days);
    expect(out).toHaveLength(2);
    expect(out[0]!.dayCount).toBe(7);
    expect(out[0]!.totalCents).toBe(350_000);
    expect(out[1]!.dayCount).toBe(1);
    expect(out[1]!.weekNumber).toBe(2);
    expect(out[1]!.totalCents).toBe(80_000);
    expect(out[1]!.startDate).toBe("2026-07-20");
  });

  it("aggregates costs per category across mixed categories", () => {
    const days = [
      input("2026-07-13", {
        total: 1500,
        breakdown: {
          cast: 500,
          crew: 500,
          locations: 250,
          vehicles: 250,
          other: 0,
          contingency: 0,
        },
      }),
      input("2026-07-14", {
        total: 1500,
        breakdown: {
          cast: 500,
          crew: 500,
          locations: 0,
          vehicles: 0,
          other: 250,
          contingency: 250,
        },
      }),
    ];
    const out = aggregateProductionLinesByWeek(days);
    expect(out).toHaveLength(1);
    expect(out[0]!.linesByCategory.cast?.totalCents).toBe(100_000);
    expect(out[0]!.linesByCategory.crew?.totalCents).toBe(100_000);
    expect(out[0]!.linesByCategory.locations?.totalCents).toBe(25_000);
    expect(out[0]!.linesByCategory.vehicles?.totalCents).toBe(25_000);
    expect(out[0]!.linesByCategory.other?.totalCents).toBe(25_000);
    expect(out[0]!.linesByCategory.contingency?.totalCents).toBe(25_000);
  });

  it("returns an empty array when given no days", () => {
    expect(aggregateProductionLinesByWeek([])).toEqual([]);
  });

  it("handles a Sunday-to-Monday rollover (last day Sun, next day Mon)", () => {
    // 2026-07-19 = Sunday, 2026-07-20 = Monday
    const out = aggregateProductionLinesByWeek([
      input("2026-07-19", { total: 500 }),
      input("2026-07-20", { total: 700 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.endDate).toBe("2026-07-19");
    expect(out[1]!.weekNumber).toBe(2);
    expect(out[1]!.startDate).toBe("2026-07-20");
  });
});
