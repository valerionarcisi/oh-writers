import { describe, it, expect } from "vitest";
import {
  estimateSceneCost,
  DEFAULT_PRODUCTION_RATES,
  type SceneCostInput,
} from "./estimate-scene-cost.js";

const baseInput = (override: Partial<SceneCostInput> = {}): SceneCostInput => ({
  sceneNumber: 1,
  intExt: "INT",
  timeOfDay: "GIORNO",
  characters: [],
  elementsByCategory: {},
  estimatedShootHours: 8,
  ...override,
});

describe("estimateSceneCost — interior day dialogue", () => {
  it("produces a low total and difficulty 1 for a static two-hander", () => {
    const out = estimateSceneCost(
      baseInput({
        intExt: "INT",
        timeOfDay: "GIORNO",
        characters: ["MARTA", "FILIPPO"],
        elementsByCategory: { cast: ["MARTA", "FILIPPO"], props: ["tazza"] },
      }),
      DEFAULT_PRODUCTION_RATES,
    );
    expect(out.difficulty).toBe(1);
    expect(out.lines.some((l) => l.category === "cast")).toBe(true);
    expect(out.lines.some((l) => l.category === "sfx")).toBe(false);
    expect(out.lines.some((l) => l.category === "vfx")).toBe(false);
    expect(out.total).toBeGreaterThan(0);
    expect(out.notes).toContain("Dialogo statico, no SFX, no esterni.");
  });
});

describe("estimateSceneCost — night exterior with stunts and SFX", () => {
  it("ramps difficulty to 5 and adds SFX + notes", () => {
    const out = estimateSceneCost(
      baseInput({
        intExt: "EXT",
        timeOfDay: "NOTTE",
        characters: ["ALMA", "KILLER", "POLIZIOTTO 1", "POLIZIOTTO 2", "TESTIMONE"],
        elementsByCategory: {
          cast: ["ALMA", "KILLER"],
          sfx: ["fumo", "sangue"],
          stunts: ["inseguimento"],
          extras: Array.from({ length: 20 }, (_, i) => `extra ${i + 1}`),
        },
        estimatedShootHours: 10,
      }),
      DEFAULT_PRODUCTION_RATES,
    );
    expect(out.difficulty).toBe(5);
    expect(out.lines.some((l) => l.category === "sfx")).toBe(true);
    expect(out.notes.some((n) => n.includes("Esterno notte"))).toBe(true);
    expect(out.notes.some((n) => n.includes("Comparse"))).toBe(true);
  });
});

describe("estimateSceneCost — location reuse", () => {
  it("zeros the location line and notes continuity", () => {
    const out = estimateSceneCost(
      baseInput({
        characters: ["MARTA"],
        elementsByCategory: { cast: ["MARTA"] },
        isLocationReused: true,
      }),
      DEFAULT_PRODUCTION_RATES,
    );
    const loc = out.lines.find((l) => l.category === "locations");
    expect(loc?.amount).toBe(0);
    expect(out.notes.some((n) => n.includes("continuità"))).toBe(true);
  });
});

describe("estimateSceneCost — VFX shots", () => {
  it("adds one VFX line scaling with shot count", () => {
    const out = estimateSceneCost(
      baseInput({
        characters: ["HERO"],
        elementsByCategory: {
          cast: ["HERO"],
          vfx: ["spaceship", "explosion", "alien"],
        },
      }),
      DEFAULT_PRODUCTION_RATES,
    );
    const vfx = out.lines.find((l) => l.category === "vfx");
    expect(vfx).toBeDefined();
    expect(vfx!.amount).toBe(
      3 * DEFAULT_PRODUCTION_RATES.vfxBasePerShot,
    );
    expect(out.difficulty).toBeGreaterThanOrEqual(2);
  });
});

describe("estimateSceneCost — empty scene", () => {
  it("returns a positive crew + location + equipment + catering total", () => {
    const out = estimateSceneCost(baseInput(), DEFAULT_PRODUCTION_RATES);
    expect(out.total).toBeGreaterThan(0);
    expect(out.difficulty).toBe(1);
    expect(out.lines.find((l) => l.category === "crew")).toBeDefined();
    expect(out.lines.find((l) => l.category === "locations")).toBeDefined();
    expect(out.lines.find((l) => l.category === "equipment")).toBeDefined();
    expect(out.lines.find((l) => l.category === "catering")).toBeDefined();
  });
});

describe("estimateSceneCost — half-day scene", () => {
  it("scales crew and location costs by the day fraction", () => {
    const full = estimateSceneCost(
      baseInput({
        characters: ["A"],
        elementsByCategory: { cast: ["A"] },
        estimatedShootHours: 8,
      }),
      DEFAULT_PRODUCTION_RATES,
    );
    const half = estimateSceneCost(
      baseInput({
        characters: ["A"],
        elementsByCategory: { cast: ["A"] },
        estimatedShootHours: 4,
      }),
      DEFAULT_PRODUCTION_RATES,
    );
    expect(half.total).toBeLessThan(full.total);
    const fullCrew = full.lines.find((l) => l.category === "crew")!.amount;
    const halfCrew = half.lines.find((l) => l.category === "crew")!.amount;
    expect(halfCrew).toBeLessThan(fullCrew);
  });
});
