import { describe, it, expect } from "vitest";
import { extractScenesFromFountain } from "./extract-scenes.js";

const FOUNTAIN_FIVE = `Title: My Script
Author: Valerio

INT. CUCINA - GIORNO

Filippo entra.

EXT. STRADA - NOTTE

Pioggia.

INT. UFFICIO - GIORNO

Tea telefona.

EXT. PARCO - SERA

Bambini giocano.

INT. AUTO - NOTTE

Silenzio.
`;

describe("extractScenesFromFountain", () => {
  it("returns empty string when selection is empty", () => {
    expect(extractScenesFromFountain(FOUNTAIN_FIVE, [])).toBe("");
  });

  it("keeps only selected scenes by ordinal index", () => {
    const result = extractScenesFromFountain(FOUNTAIN_FIVE, ["2", "4"]);
    expect(result).toContain("EXT. STRADA - NOTTE");
    expect(result).toContain("EXT. PARCO - SERA");
    expect(result).not.toContain("INT. CUCINA - GIORNO");
    expect(result).not.toContain("INT. UFFICIO - GIORNO");
    expect(result).not.toContain("INT. AUTO - NOTTE");
  });

  it("strips the title block entirely", () => {
    const result = extractScenesFromFountain(FOUNTAIN_FIVE, ["1"]);
    expect(result).not.toContain("Title:");
    expect(result).not.toContain("Author:");
  });

  it("preserves the body of each kept scene", () => {
    const result = extractScenesFromFountain(FOUNTAIN_FIVE, ["1"]);
    expect(result).toContain("Filippo entra");
  });

  it("supports explicit #N# scene-number selection", () => {
    const fountain = `INT. UNO #A1#\n\nx\n\nEXT. DUE #A2#\n\ny\n\nINT. TRE #A3#\n\nz\n`;
    const result = extractScenesFromFountain(fountain, ["A2"]);
    expect(result).toContain("EXT. DUE");
    expect(result).not.toContain("INT. UNO");
    expect(result).not.toContain("INT. TRE");
  });

  it("ignores selections that don't match any scene", () => {
    const result = extractScenesFromFountain(FOUNTAIN_FIVE, ["99", "Z"]);
    expect(result).toBe("");
  });
});
