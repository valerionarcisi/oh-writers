import { describe, it, expect } from "vitest";
import { findSection } from "./cesare-tools";
import { parsePlanDescription } from "./cesare-shooting-plan-tools";

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
    const shots = parsePlanDescription("qualcosa di completamente non descritto");
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
