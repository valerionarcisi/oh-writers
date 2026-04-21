import { describe, it, expect } from "vitest";
import { mockCesareBreakdownForScene } from "./ai-responses";

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
