/**
 * BUG-N63 defect 1, export path: the PDF renders the STORED fountain, not
 * the editor's doc — the export must canonicalize through the same lens the
 * editor uses or AI-shaped content loses its dialogue blocks in the PDF.
 */
import { describe, it, expect } from "vitest";
import { canonicalizeFountain } from "./fountain-canonical";
import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";

describe("canonicalizeFountain", () => {
  it("heals AI-shaped speech at the cue indent into cue + dialogue", () => {
    const stored = [
      "EXT. MURETTO - NOTTE",
      "",
      "Marco parla al telefono.",
      "",
      "      MARCO (V.O.)",
      "",
      "      Luca, ascolta. Non interrompermi.",
    ].join("\n");
    const out = canonicalizeFountain(stored);
    expect(out).toContain(
      `${CHARACTER_INDENT}MARCO (V.O.)\n${DIALOGUE_INDENT}Luca, ascolta. Non interrompermi.`,
    );
  });

  it("keeps every line of consecutive dialogue blocks", () => {
    const stored = [
      "INT. AULA - GIORNO",
      "",
      "MARCO",
      "Prima battuta.",
      "Seconda battuta consecutiva.",
      "",
      "SOFIA",
      "Risposta immediata.",
    ].join("\n");
    const out = canonicalizeFountain(stored);
    expect(out).toContain(`${DIALOGUE_INDENT}Prima battuta.`);
    expect(out).toContain(`${DIALOGUE_INDENT}Seconda battuta consecutiva.`);
    expect(out).toContain(`${DIALOGUE_INDENT}Risposta immediata.`);
  });

  it("keeps dialogue after a transition", () => {
    const stored = [
      "EXT. CORTILE - GIORNO",
      "",
      "CUT TO:",
      "",
      "GIULIA",
      "Passamela!",
    ].join("\n");
    const out = canonicalizeFountain(stored);
    expect(out).toContain("CUT TO:");
    expect(out).toContain(`${DIALOGUE_INDENT}Passamela!`);
  });

  it("is idempotent (already-canonical content passes through)", () => {
    const stored = [
      "INT. CASA - GIORNO",
      "",
      "Mario entra.",
      "",
      `${CHARACTER_INDENT}MARIO`,
      `${DIALOGUE_INDENT}Ciao.`,
    ].join("\n");
    const once = canonicalizeFountain(stored);
    expect(canonicalizeFountain(once)).toBe(once);
  });

  it("survives an empty screenplay (sad path)", () => {
    expect(() => canonicalizeFountain("")).not.toThrow();
  });

  it("survives content without any scene heading (sad path)", () => {
    const out = canonicalizeFountain("Solo una riga di azione.");
    expect(out).toContain("Solo una riga di azione.");
  });
});
