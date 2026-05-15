import { describe, it, expect } from "vitest";
import {
  computeBudgetOverview,
  type BudgetOverviewInput,
} from "./budget-helpers";

const baseInput = (
  override: Partial<BudgetOverviewInput> = {},
): BudgetOverviewInput => ({
  lines: [],
  resources: {
    castTotal: 0,
    castCount: 0,
    castMissingRates: 0,
    crewTotal: 0,
    crewEnabledCount: 0,
  },
  contingencyPercent: 10,
  shootingDays: null,
  sceneCount: 0,
  status: "estimated",
  previousTotal: null,
  ...override,
});

describe("computeBudgetOverview", () => {
  it("returns zero totals for an empty budget", () => {
    const result = computeBudgetOverview(baseInput());
    expect(result.grandTotal).toBe(0);
    expect(result.deltaPercent).toBeNull();
    expect(result.perDay).toBeNull();
    expect(result.perScene).toBeNull();
    expect(result.categories.map((c) => c.id)).toEqual(["cast", "crew"]);
  });

  it("aggregates production lines into the correct categories", () => {
    const result = computeBudgetOverview(
      baseInput({
        lines: [
          {
            topSheet: "production",
            linkedCategory: "locations",
            rate: 1000,
            quantity: 5,
            actual: null,
          },
          {
            topSheet: "production",
            linkedCategory: "props",
            rate: 200,
            quantity: 10,
            actual: null,
          },
          {
            topSheet: "production",
            linkedCategory: "set_dress",
            rate: 100,
            quantity: 10,
            actual: null,
          },
          {
            topSheet: "production",
            linkedCategory: "equipment",
            rate: 500,
            quantity: 8,
            actual: null,
          },
        ],
        contingencyPercent: 0,
      }),
    );
    const byId = new Map(result.categories.map((c) => [c.id, c.total]));
    expect(byId.get("locations")).toBe(5000);
    expect(byId.get("scenografia")).toBe(2000 + 1000);
    expect(byId.get("fotografia")).toBe(4000);
    expect(result.grandTotal).toBe(12000);
    expect(result.productionTotal).toBe(12000);
  });

  it("prefers `actual` over rate*quantity when present", () => {
    const result = computeBudgetOverview(
      baseInput({
        lines: [
          {
            topSheet: "production",
            linkedCategory: "locations",
            rate: 1000,
            quantity: 5,
            actual: 7500,
          },
        ],
        contingencyPercent: 0,
      }),
    );
    expect(result.productionTotal).toBe(7500);
  });

  it("includes cast and crew totals plus contingency in grand total", () => {
    const result = computeBudgetOverview(
      baseInput({
        resources: {
          castTotal: 100000,
          castCount: 4,
          castMissingRates: 0,
          crewTotal: 80000,
          crewEnabledCount: 6,
        },
        contingencyPercent: 10,
      }),
    );
    expect(result.grandTotal).toBeCloseTo(180000 * 1.1, 2);
    expect(result.contingencyAmount).toBeCloseTo(18000);
  });

  it("flags cast warn status when there are missing rates", () => {
    const result = computeBudgetOverview(
      baseInput({
        resources: {
          castTotal: 50000,
          castCount: 4,
          castMissingRates: 2,
          crewTotal: 0,
          crewEnabledCount: 0,
        },
      }),
    );
    const cast = result.categories.find((c) => c.id === "cast");
    expect(cast?.status).toBe("warn");
    expect(cast?.statusReason).toContain("2");
  });

  it("computes delta vs previous when supplied", () => {
    const result = computeBudgetOverview(
      baseInput({
        resources: {
          castTotal: 100,
          castCount: 1,
          castMissingRates: 0,
          crewTotal: 0,
          crewEnabledCount: 0,
        },
        contingencyPercent: 0,
        previousTotal: 80,
      }),
    );
    expect(result.deltaPercent).toBeCloseTo(25);
  });

  it("computes per-day and per-scene means when context exists", () => {
    const result = computeBudgetOverview(
      baseInput({
        resources: {
          castTotal: 1000,
          castCount: 1,
          castMissingRates: 0,
          crewTotal: 0,
          crewEnabledCount: 0,
        },
        contingencyPercent: 0,
        shootingDays: 10,
        sceneCount: 5,
      }),
    );
    expect(result.perDay).toBe(100);
    expect(result.perScene).toBe(200);
  });

  it("marks the entire budget as locked when status is locked", () => {
    const result = computeBudgetOverview(
      baseInput({
        status: "locked",
        resources: {
          castTotal: 100,
          castCount: 1,
          castMissingRates: 0,
          crewTotal: 50,
          crewEnabledCount: 1,
        },
      }),
    );
    expect(result.lockedCategoryCount).toBeGreaterThan(0);
    expect(result.categories.every((c) => c.status === "locked")).toBe(true);
  });

  it("orders categories by total descending", () => {
    const result = computeBudgetOverview(
      baseInput({
        lines: [
          {
            topSheet: "production",
            linkedCategory: "locations",
            rate: 5000,
            quantity: 1,
            actual: null,
          },
          {
            topSheet: "production",
            linkedCategory: "equipment",
            rate: 1000,
            quantity: 1,
            actual: null,
          },
        ],
        resources: {
          castTotal: 20000,
          castCount: 1,
          castMissingRates: 0,
          crewTotal: 10000,
          crewEnabledCount: 1,
        },
        contingencyPercent: 0,
      }),
    );
    expect(result.categories[0]?.id).toBe("cast");
    expect(result.categories[1]?.id).toBe("crew");
    expect(result.categories[2]?.id).toBe("locations");
  });
});
