import { describe, it, expect } from "vitest";
import {
  findSection,
  parseHeading,
  extractSideChannelMarkers,
} from "./cesare-tools";
import { parsePlanDescription } from "./cesare-shooting-plan-tools";

// F-A3 — the server emits a success marker ONLY when a write tool genuinely
// mutated the DB, so the client card can never fabricate success. For the
// non-document write tools (budget/location/schedule/shooting) the honest
// signal is a generic `entity-applied` marker carrying the entity the TOOL
// touched (not the page), which fixes F-M1 at the source.
describe("extractSideChannelMarkers — honest success for write tools", () => {
  const markersFor = (toolName: string, content: string): string[] => {
    const acc: string[] = [];
    extractSideChannelMarkers(toolName, content, acc);
    return acc;
  };

  it("emits an entity-applied marker when a budget write succeeds", () => {
    const markers = markersFor(
      "add_budget_line",
      JSON.stringify({ id: "line-1", name: "Grip", topSheet: "below-line" }),
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toContain("ohw:entity-applied");
    expect(markers[0]).toContain('"domain":"budget"');
  });

  it("does NOT emit a marker when a write tool FAILS (error result)", () => {
    const markers = markersFor(
      "add_budget_line",
      JSON.stringify({ error: "Budget is locked" }),
    );
    expect(markers).toEqual([]);
  });

  it("does NOT emit a marker for a READ tool", () => {
    const markers = markersFor(
      "read_budget_lines",
      JSON.stringify({ lines: [] }),
    );
    expect(markers).toEqual([]);
  });

  it("does NOT emit a marker when the result is not a JSON object", () => {
    expect(markersFor("move_scene_to_day", "not-json")).toEqual([]);
    expect(markersFor("move_scene_to_day", "null")).toEqual([]);
  });

  it("carries the entity the TOOL touched, not the page (F-M1)", () => {
    const markers = markersFor(
      "create_location_requirement",
      JSON.stringify({ requirement_id: "r-1", created: true }),
    );
    expect(markers[0]).toContain('"domain":"locations"');
  });

  it("does NOT emit an applied marker for a proposal tool", () => {
    // propose_* tools only surface a suggestion to accept — they apply nothing,
    // so claiming an edit would be the F-A3 bug.
    const markers = markersFor(
      "propose_missing_lines",
      JSON.stringify({ proposals: [{ id: "g-1" }] }),
    );
    expect(markers).toEqual([]);
  });
});

describe("parseHeading", () => {
  it("parses a standard INT slugline", () => {
    expect(parseHeading("INT. CUCINA - GIORNO")).toEqual({
      name: "CUCINA",
      intExt: "INT",
      timeOfDay: ["GIORNO"],
    });
  });

  it("parses EXT with multi-segment time-of-day", () => {
    expect(parseHeading("EXT. STRADA - SESTO SAN GIOVANNI - NOTTE")).toEqual({
      name: "STRADA",
      intExt: "EXT",
      timeOfDay: ["SESTO SAN GIOVANNI", "NOTTE"],
    });
  });

  it("recognises INT./EXT. compound prefix", () => {
    const r = parseHeading("INT./EXT. RADICE - NOTTE");
    expect(r.intExt).toBe("INT/EXT");
    expect(r.name).toBe("RADICE");
  });

  it("folds EST. into EXT (schema doesn't model EST separately)", () => {
    expect(parseHeading("EST. PIAZZA - ALBA").intExt).toBe("EXT");
  });

  it("recognises I/E shorthand as INT", () => {
    expect(parseHeading("I/E AUTO - GIORNO").intExt).toBe("INT");
  });

  it("returns null intExt when no prefix is present", () => {
    expect(parseHeading("UNA STRADA QUALSIASI").intExt).toBeNull();
  });

  it("handles a heading with no time-of-day", () => {
    expect(parseHeading("INT. STUDIO")).toEqual({
      name: "STUDIO",
      intExt: "INT",
      timeOfDay: [],
    });
  });

  it("trims surrounding whitespace", () => {
    const r = parseHeading("   EXT. BAR - GIORNO   ");
    expect(r.name).toBe("BAR");
    expect(r.intExt).toBe("EXT");
  });
});

describe("findSection", () => {
  it("finds a markdown section and bounds the body at the next heading", () => {
    const doc = [
      "# Atto I",
      "",
      "Prima parte.",
      "",
      "## Atto II",
      "",
      "Seconda parte,",
      "ancora seconda parte.",
      "",
      "# Atto III",
      "",
      "Terza parte.",
    ].join("\n");

    const range = findSection(doc, "Atto II");
    expect(range).not.toBeNull();
    if (!range) return;
    expect(range.headingText).toBe("## Atto II");
    expect(range.bodyStart).toBe(5);
    expect(range.bodyEnd).toBe(9);
  });

  it("returns null when the heading is missing", () => {
    const doc = "# Atto I\n\nQualcosa.";
    expect(findSection(doc, "Non esiste")).toBeNull();
  });

  it("is case-insensitive and tolerant of markdown markers", () => {
    const doc = "### conclusione\n\nFine.";
    const range = findSection(doc, "Conclusione");
    expect(range).not.toBeNull();
    if (!range) return;
    expect(range.headingText).toBe("### conclusione");
  });

  it("treats the document end as the body terminator when no further heading exists", () => {
    const doc = "# Solo\n\nLinea uno.\nLinea due.\n";
    const range = findSection(doc, "Solo");
    expect(range).not.toBeNull();
    if (!range) return;
    expect(range.bodyEnd).toBe(5);
  });
});

describe("parsePlanDescription", () => {
  it("recognizes a mixed Italian/English shot list", () => {
    const shots = parsePlanDescription(
      "classico: WS forno, due CU di Giulio, OTS Tea, insert delle foto",
    );
    expect(shots.map((s) => s.shotSize)).toEqual([
      "WS",
      "CU",
      "CU",
      "OTS",
      "INSERT",
    ]);
  });

  it("expands Italian repetition keywords (tre CU)", () => {
    const shots = parsePlanDescription("tre CU di Giulio");
    expect(shots).toHaveLength(3);
    expect(shots.every((s) => s.shotSize === "CU")).toBe(true);
  });

  it("falls back to a single WS when no keyword is recognized", () => {
    const shots = parsePlanDescription(
      "qualcosa di completamente non descritto",
    );
    expect(shots).toHaveLength(1);
    expect(shots[0]?.shotSize).toBe("WS");
  });

  it("disambiguates primissimo piano (ECU) from primo piano (CU)", () => {
    const shots = parsePlanDescription("primissimo piano di Giulio");
    expect(shots).toHaveLength(1);
    expect(shots[0]?.shotSize).toBe("ECU");
  });

  it("treats numeric prefixes as repeat counts", () => {
    const shots = parsePlanDescription("4 inserts delle foto");
    expect(shots).toHaveLength(4);
    expect(shots.every((s) => s.shotSize === "INSERT")).toBe(true);
  });

  it("preserves order across separators ('e', 'poi', commas)", () => {
    const shots = parsePlanDescription("WS, poi CU e infine OTS");
    expect(shots.map((s) => s.shotSize)).toEqual(["WS", "CU", "OTS"]);
  });
});
