import { describe, it, expect } from "vitest";
import { findSection } from "./cesare-tools";

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
