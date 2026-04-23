import { describe, it, expect } from "vitest";
import {
  mockCesareBreakdownForScene,
  mockFullScriptBreakdown,
} from "./ai-responses";

describe("mockCesareBreakdownForScene", () => {
  it("[OHW-257] returns the deterministic 5-suggestion warehouse fixture", () => {
    const sceneText =
      "INT. WAREHOUSE - NIGHT\nRick walks in carrying a bloody knife. Three POLICE CARS arrive. A dog barks. 50 EXTRAS in riot gear.";
    const suggestions = mockCesareBreakdownForScene(sceneText);

    expect(suggestions).toHaveLength(5);
    expect(suggestions.map((s) => s.category).sort()).toEqual([
      "animals",
      "cast",
      "extras",
      "props",
      "vehicles",
    ]);
    const byName = Object.fromEntries(suggestions.map((s) => [s.name, s]));
    expect(byName["Rick"]?.category).toBe("cast");
    expect(byName["Bloody knife"]?.category).toBe("props");
    expect(byName["Police car"]?.quantity).toBe(3);
    expect(byName["Dog"]?.category).toBe("animals");
    expect(byName["Riot squad"]?.quantity).toBe(50);
  });

  it("falls back to the CAPS heuristic returning the first 3 uppercase tokens as cast", () => {
    const sceneText = "MARIA cooks. GIUSEPPE enters. ROBERTO leaves.";
    const suggestions = mockCesareBreakdownForScene(sceneText);

    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((s) => s.category === "cast")).toBe(true);
    expect(suggestions.map((s) => s.name)).toEqual([
      "Maria",
      "Giuseppe",
      "Roberto",
    ]);
  });

  it("returns an empty array for scenes without uppercase tokens", () => {
    expect(mockCesareBreakdownForScene("a quiet moment")).toEqual([]);
  });
});

describe("mockFullScriptBreakdown", () => {
  it("[OHW-335-unit] returns one entry per scene preserving 1-based numbers", () => {
    const out = mockFullScriptBreakdown([
      { sceneNumber: 1, heading: "INT. KITCHEN", body: "Maria cooks." },
      { sceneNumber: 2, heading: "EXT. STREET", body: "Giuseppe walks." },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.sceneNumber).toBe(1);
    expect(out[1]?.sceneNumber).toBe(2);
  });

  it("derives at most 3 cast items per scene from CAPS tokens", () => {
    const out = mockFullScriptBreakdown([
      {
        sceneNumber: 1,
        heading: "INT. APARTMENT",
        body: "MARIA, GIUSEPPE, ROBERTO and ALICE meet.",
      },
    ]);
    const cast = out[0]?.items.filter((i) => i.category === "cast") ?? [];
    expect(cast.length).toBeLessThanOrEqual(3);
    expect(cast.every((c) => c.confidence >= 0.8)).toBe(true);
  });

  it("adds a 'Bottiglia' prop when the body mentions a bottle", () => {
    const out = mockFullScriptBreakdown([
      {
        sceneNumber: 1,
        heading: "INT. BAR",
        body: "He grabs a bottle from the shelf.",
      },
    ]);
    const props = out[0]?.items.filter((i) => i.category === "props") ?? [];
    expect(props).toEqual([
      { name: "Bottiglia", category: "props", quantity: 1, confidence: 0.85 },
    ]);
  });

  it("emits no items when neither CAPS nor bottle pattern matches", () => {
    const out = mockFullScriptBreakdown([
      { sceneNumber: 1, heading: "interno casa", body: "una scena tranquilla" },
    ]);
    expect(out[0]?.items).toEqual([]);
  });
});
