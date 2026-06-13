import { describe, it, expect } from "vitest";
import { normalizeFountainForExport } from "./normalize-fountain";
import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";

// BUG-N63 (export side): the stored Fountain of "Scienze Naturali" scene 9
// indents the LUCA/MARCO speech at the 6-space CHARACTER_INDENT (aligned under
// the cue) instead of the 10-space DIALOGUE_INDENT. afterwriting keys the PDF
// element off the column, so a 6-space speech renders as ACTION at the left
// margin. normalizeFountainForExport round-trips through the editor's
// parser/serializer to re-emit every element at its canonical indent, so the
// renderer sees dialogue where dialogue belongs.
describe("normalizeFountainForExport — BUG-N63", () => {
  // The exact real-content layout: cue → blank → 6-space speech → action →
  // cue → blank → 6-space speech → cue → blank → 6-space speech.
  const sceneNineRaw = [
    "EXT. MURETTO SOTTO CASA DI MARCO - NOTTE",
    "",
    "Marco smette di registrare. Silenzio. Poi voce di Luca.",
    "",
    "      LUCA (V.O.)",
    "",
    "      Alla fine ha trovato quello che cercava?",
    "",
    "Pausa. Marco guarda il telefono.",
    "",
    "      MARCO (V.O.)",
    "",
    "      Non lo so.",
    "",
    "      LUCA (V.O.)",
    "",
    "      E tu?",
    "",
    "Marco abbassa il telefono. Non risponde.",
  ].join("\n");

  const lineFor = (out: string, needle: string): string =>
    out.split("\n").find((l) => l.includes(needle)) ?? "";

  const indentOf = (line: string): number =>
    line.length - line.trimStart().length;

  it("re-indents 6-space speech to the canonical 10-space dialogue indent", () => {
    const out = normalizeFountainForExport(sceneNineRaw);

    // Every speech line ends up at DIALOGUE_INDENT (10 spaces) — afterwriting
    // then renders these as dialogue (x≈180), not action (x≈108).
    expect(indentOf(lineFor(out, "Alla fine ha trovato"))).toBe(
      DIALOGUE_INDENT.length,
    );
    expect(indentOf(lineFor(out, "Non lo so."))).toBe(DIALOGUE_INDENT.length);
    expect(indentOf(lineFor(out, "E tu?"))).toBe(DIALOGUE_INDENT.length);
  });

  it("keeps character cues at the 6-space character indent", () => {
    const out = normalizeFountainForExport(sceneNineRaw);
    expect(indentOf(lineFor(out, "LUCA (V.O.)"))).toBe(CHARACTER_INDENT.length);
    expect(indentOf(lineFor(out, "MARCO (V.O.)"))).toBe(
      CHARACTER_INDENT.length,
    );
  });

  it("keeps interleaved action lines flush left (x≈108 in the PDF)", () => {
    const out = normalizeFountainForExport(sceneNineRaw);
    expect(indentOf(lineFor(out, "Pausa. Marco guarda"))).toBe(0);
    expect(indentOf(lineFor(out, "Marco abbassa il telefono"))).toBe(0);
    expect(indentOf(lineFor(out, "Marco smette di registrare"))).toBe(0);
  });

  it("preserves the scene heading verbatim", () => {
    const out = normalizeFountainForExport(sceneNineRaw);
    expect(out).toContain("EXT. MURETTO SOTTO CASA DI MARCO - NOTTE");
  });

  it("is idempotent — normalizing canonical Fountain is a no-op in shape", () => {
    const once = normalizeFountainForExport(sceneNineRaw);
    const twice = normalizeFountainForExport(once);
    expect(twice).toBe(once);
  });

  it("leaves already-canonical 10-space dialogue untouched", () => {
    const canonical = [
      "INT. OFFICE - DAY",
      "",
      `${CHARACTER_INDENT}MARCO (V.O.)`,
      `${DIALOGUE_INDENT}Luca, ascolta. non interrompermi.`,
    ].join("\n");
    const out = normalizeFountainForExport(canonical);
    expect(indentOf(lineFor(out, "Luca, ascolta"))).toBe(
      DIALOGUE_INDENT.length,
    );
    expect(indentOf(lineFor(out, "MARCO (V.O.)"))).toBe(
      CHARACTER_INDENT.length,
    );
  });
});
