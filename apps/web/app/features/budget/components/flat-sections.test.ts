import { describe, it, expect } from "vitest";
import {
  buildFlatSections,
  grandTotalOf,
  SectionIds,
} from "./flat-sections";
import type { BudgetLine } from "@oh-writers/domain";
import type { BudgetCast, BudgetCrew } from "@oh-writers/db/schema";

const castRow = (over: Partial<BudgetCast> = {}): BudgetCast => ({
  id: over.id ?? "cast-1",
  budgetId: "b-1",
  elementId: null,
  name: over.name ?? "Marco",
  days: over.days ?? "3",
  dayRate: over.dayRate ?? "200",
  fiscalRegime: over.fiscalRegime ?? "piva",
  mealAllowance: over.mealAllowance ?? "0",
  accommodation: over.accommodation ?? "0",
  sortOrder: over.sortOrder ?? 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const crewRow = (over: Partial<BudgetCrew> = {}): BudgetCrew => ({
  id: over.id ?? "crew-1",
  budgetId: "b-1",
  roleKey: null,
  name: over.name ?? "Direttore fotografia",
  department: over.department ?? "Camera",
  days: over.days ?? "5",
  dayRate: over.dayRate ?? "400",
  fiscalRegime: over.fiscalRegime ?? "piva",
  mealAllowance: over.mealAllowance ?? "0",
  accommodation: over.accommodation ?? "0",
  enabled: over.enabled ?? true,
  sortOrder: over.sortOrder ?? 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const line = (over: Partial<BudgetLine> = {}): BudgetLine => ({
  id: over.id ?? "line-1",
  budgetId: "b-1",
  topSheet: over.topSheet ?? "production",
  name: over.name ?? "Affitto location",
  costType: over.costType ?? "flat",
  quantity: over.quantity ?? 2,
  rate: over.rate ?? 500,
  actual: over.actual ?? null,
  notes: over.notes ?? null,
  linkedElementId: over.linkedElementId ?? null,
  linkedCategory: over.linkedCategory ?? "locations",
  sortOrder: over.sortOrder ?? 0,
});

describe("buildFlatSections", () => {
  it("returns Cast and Crew sections even when empty", () => {
    const sections = buildFlatSections({ lines: [], cast: [], crew: [] });
    const ids = sections.map((s) => s.id);
    expect(ids).toContain(SectionIds.CAST);
    expect(ids).toContain(SectionIds.CREW);
  });

  it("maps production lines by linkedCategory", () => {
    const sections = buildFlatSections({
      lines: [
        line({ id: "l1", linkedCategory: "locations" }),
        line({ id: "l2", linkedCategory: "props", name: "Mobile" }),
      ],
      cast: [],
      crew: [],
    });
    const loc = sections.find((s) => s.id === SectionIds.LOCATIONS);
    const scen = sections.find((s) => s.id === SectionIds.SCENOGRAFIA);
    expect(loc?.rows).toHaveLength(1);
    expect(scen?.rows).toHaveLength(1);
  });

  it("handles a single cast row with rates", () => {
    const sections = buildFlatSections({
      lines: [],
      cast: [castRow({ days: "2", dayRate: "300" })],
      crew: [],
    });
    const cast = sections.find((s) => s.id === SectionIds.CAST);
    expect(cast?.rows).toHaveLength(1);
    expect(cast?.total).toBeGreaterThan(0);
  });

  it("returns 0 totals for cast rows without rates", () => {
    const sections = buildFlatSections({
      lines: [],
      cast: [castRow({ dayRate: "0" })],
      crew: [],
    });
    const cast = sections.find((s) => s.id === SectionIds.CAST);
    expect(cast?.rows).toHaveLength(1);
    expect(cast?.total).toBe(0);
  });

  it("excludes disabled crew rows from total", () => {
    const sections = buildFlatSections({
      lines: [],
      cast: [],
      crew: [crewRow({ id: "c1", enabled: false })],
    });
    const crew = sections.find((s) => s.id === SectionIds.CREW);
    expect(crew?.total).toBe(0);
  });

  it("routes post_production and contingency to their sections", () => {
    const sections = buildFlatSections({
      lines: [
        line({ id: "p1", topSheet: "post_production", linkedCategory: null }),
        line({ id: "c1", topSheet: "contingency", linkedCategory: null }),
      ],
      cast: [],
      crew: [],
    });
    expect(sections.find((s) => s.id === SectionIds.POST)?.rows).toHaveLength(1);
    expect(
      sections.find((s) => s.id === SectionIds.CONTINGENCY)?.rows,
    ).toHaveLength(1);
  });

  it("grandTotalOf sums all sections", () => {
    const sections = buildFlatSections({
      lines: [
        line({ rate: 1000, quantity: 1, linkedCategory: "locations" }),
      ],
      cast: [],
      crew: [],
    });
    expect(grandTotalOf(sections)).toBeGreaterThanOrEqual(1000);
  });

  it("uses actual when set, otherwise rate * quantity", () => {
    const sections = buildFlatSections({
      lines: [
        line({ id: "a", rate: 100, quantity: 2, actual: 250 }),
      ],
      cast: [],
      crew: [],
    });
    const loc = sections.find((s) => s.id === SectionIds.LOCATIONS);
    expect(loc?.rows[0]?.total).toBe(250);
  });
});
