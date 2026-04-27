import { describe, it, expect } from "vitest";
import { SUBJECT_SECTIONS } from "@oh-writers/domain";
import {
  mockCesareBreakdownForScene,
  mockFullScriptBreakdown,
  mockSubjectSection,
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

  it("[OHW-258-bug] never emits cast items derived from the scene heading", () => {
    const out = mockFullScriptBreakdown([
      {
        sceneNumber: 1,
        heading: "INT/EXT. ANGOLO OPEN GREZZO/FUORI DALLA PORTA - NOTTE",
        body: "Marco entra. Apre la porta.",
      },
    ]);
    const castNames = (out[0]?.items ?? [])
      .filter((i) => i.category === "cast")
      .map((c) => c.name);
    // None of the slugline tokens should leak into the cast list.
    for (const forbidden of [
      "Int",
      "Ext",
      "Angolo",
      "Open",
      "Grezzo",
      "Notte",
      "Fuori",
      "Dalla",
      "Porta",
    ]) {
      expect(castNames).not.toContain(forbidden);
    }
  });

  it("filters known IT/EN slugline + time-of-day stopwords even when present in body", () => {
    const out = mockFullScriptBreakdown([
      {
        sceneNumber: 1,
        heading: "INT. STANZA - NOTTE",
        body: "MARIA grida: 'NOTTE FONDA!'. GIORNO arriva.",
      },
    ]);
    const castNames = (out[0]?.items ?? [])
      .filter((i) => i.category === "cast")
      .map((c) => c.name);
    expect(castNames).toContain("Maria");
    expect(castNames).not.toContain("Notte");
    expect(castNames).not.toContain("Giorno");
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

describe("mockSubjectSection", () => {
  it("returns non-empty prose for every section with null genre", () => {
    for (const section of SUBJECT_SECTIONS) {
      const out = mockSubjectSection(section, null);
      expect(out.length).toBeGreaterThan(20);
    }
  });

  it("is deterministic — same inputs produce identical output", () => {
    for (const section of SUBJECT_SECTIONS) {
      expect(mockSubjectSection(section, null)).toBe(
        mockSubjectSection(section, null),
      );
      expect(mockSubjectSection(section, "thriller")).toBe(
        mockSubjectSection(section, "thriller"),
      );
    }
  });

  it("returns a thriller-specific premise different from default", () => {
    expect(mockSubjectSection("premise", "thriller")).not.toBe(
      mockSubjectSection("premise", null),
    );
  });

  it("returns a drama-specific premise different from default", () => {
    expect(mockSubjectSection("premise", "drama")).not.toBe(
      mockSubjectSection("premise", null),
    );
  });

  it("falls back to default when the genre has no specific override", () => {
    expect(mockSubjectSection("world", "comedy")).toBe(
      mockSubjectSection("world", null),
    );
  });

  it("always contains at least one period (is prose)", () => {
    for (const section of SUBJECT_SECTIONS) {
      expect(mockSubjectSection(section, null)).toContain(".");
    }
  });

  it("never contains placeholder strings like TODO or lorem", () => {
    for (const section of SUBJECT_SECTIONS) {
      const out = mockSubjectSection(section, null).toLowerCase();
      expect(out).not.toContain("todo");
      expect(out).not.toContain("lorem");
    }
  });
});
