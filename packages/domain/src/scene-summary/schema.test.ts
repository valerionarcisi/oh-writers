import { describe, it, expect } from "vitest";
import { SceneSummarySchema } from "./schema.js";

describe("[OHW-038a] SceneSummarySchema", () => {
  it("parses a valid complete summary", () => {
    const input = {
      sceneNumber: 3,
      heading: "INT. CUCINA - NOTTE",
      settingDescription: "Kitchen of a provincial restaurant",
      timeOfDay: "NOTTE",
      presentCharacters: ["DANTE", "TEA"],
      keyActions: ["Dante argues with Tea", "Pots boil over"],
      productionNotes: ["Open flame gas range"],
    };
    const result = SceneSummarySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sceneNumber).toBe(3);
      expect(result.data.presentCharacters).toHaveLength(2);
    }
  });

  it("allows null timeOfDay", () => {
    const input = {
      sceneNumber: 1,
      heading: "INT. SALA",
      settingDescription: "Dining room",
      timeOfDay: null,
      presentCharacters: [],
      keyActions: [],
      productionNotes: [],
    };
    const result = SceneSummarySchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects keyActions array exceeding 5 items", () => {
    const input = {
      sceneNumber: 1,
      heading: "INT. SALA",
      settingDescription: "Dining room",
      timeOfDay: null,
      presentCharacters: [],
      keyActions: ["a", "b", "c", "d", "e", "f"],
      productionNotes: [],
    };
    const result = SceneSummarySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects productionNotes array exceeding 10 items", () => {
    const input = {
      sceneNumber: 1,
      heading: "INT. SALA",
      settingDescription: "Dining room",
      timeOfDay: null,
      presentCharacters: [],
      keyActions: [],
      productionNotes: Array.from({ length: 11 }, (_, i) => `note ${i}`),
    };
    const result = SceneSummarySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing required heading", () => {
    const input = {
      sceneNumber: 1,
      settingDescription: "Dining room",
      timeOfDay: null,
      presentCharacters: [],
      keyActions: [],
      productionNotes: [],
    };
    const result = SceneSummarySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("round-trips through JSON serialisation", () => {
    const original = {
      sceneNumber: 7,
      heading: "EXT. STRADA DEL PAESE - NOTTE",
      settingDescription: "Small-town street at night",
      timeOfDay: "NOTTE",
      presentCharacters: ["FILIPPO"],
      keyActions: ["Filippo runs away"],
      productionNotes: ["Night exterior"],
    };
    const serialised = JSON.parse(JSON.stringify(original));
    const result = SceneSummarySchema.safeParse(serialised);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(original);
  });
});
