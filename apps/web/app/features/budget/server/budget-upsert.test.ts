import { describe, it, expect } from "vitest";
import {
  aggregateProductionLines,
  PER_ELEMENT_CATEGORIES,
} from "./budget-helpers";
import type { GeneratedLine } from "@oh-writers/domain";

const makeLine = (overrides: Partial<GeneratedLine>): GeneratedLine => ({
  topSheet: "production",
  name: "Test",
  costType: "daily",
  quantity: 8,
  rate: 100,
  actual: null,
  notes: null,
  linkedElementId: "elem-1",
  linkedCategory: "equipment",
  sortOrder: 0,
  ...overrides,
});

describe("aggregateProductionLines", () => {
  it("keeps per-element categories as individual lines", () => {
    const lines = [
      makeLine({
        linkedCategory: "locations",
        linkedElementId: "loc-1",
        name: "Via del Corso",
      }),
      makeLine({
        linkedCategory: "locations",
        linkedElementId: "loc-2",
        name: "Studio",
      }),
    ];
    const result = aggregateProductionLines(lines);
    expect(result.perElement).toHaveLength(2);
    expect(result.aggregate).toHaveLength(0);
  });

  it("collapses non-per-element categories into one line per category", () => {
    const lines = [
      makeLine({
        linkedCategory: "equipment",
        linkedElementId: "eq-1",
        name: "Camera A",
        quantity: 8,
        rate: 200,
      }),
      makeLine({
        linkedCategory: "equipment",
        linkedElementId: "eq-2",
        name: "Camera B",
        quantity: 8,
        rate: 150,
      }),
      makeLine({
        linkedCategory: "sound",
        linkedElementId: "snd-1",
        name: "Boom",
        quantity: 8,
        rate: 80,
      }),
    ];
    const result = aggregateProductionLines(lines);
    expect(result.aggregate).toHaveLength(2);
    const equip = result.aggregate.find(
      (l) => l.linkedCategory === "equipment",
    )!;
    expect(equip.linkedElementId).toBeNull();
    expect(equip.quantity).toBe(2); // element count
    expect(equip.rate).toBe(350); // sum of rates
  });

  it("preserves name as category label for aggregate lines", () => {
    const lines = [
      makeLine({
        linkedCategory: "vfx",
        linkedElementId: "vfx-1",
        name: "Explosion",
      }),
    ];
    const result = aggregateProductionLines(lines);
    expect(result.aggregate[0]!.name).toBe("VFX / SFX");
  });
});
