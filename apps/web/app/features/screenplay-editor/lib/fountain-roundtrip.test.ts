import { describe, it, expect } from "vitest";
import { fountainToDoc } from "./fountain-to-doc";
import { docToFountain } from "./doc-to-fountain";

/**
 * Roundtrip invariant: fountainToDoc(docToFountain(d)) ~ d
 * (up to whitespace normalisation).
 *
 * Tested by going Fountain → doc → Fountain → doc and comparing the final
 * doc's JSON against the first doc's JSON. The first pass normalises any
 * irregular spacing in the source; subsequent passes must be stable.
 */
const stableRoundtrip = (input: string): boolean => {
  const doc1 = fountainToDoc(input);
  const fountain1 = docToFountain(doc1);
  const doc2 = fountainToDoc(fountain1);
  return JSON.stringify(doc1.toJSON()) === JSON.stringify(doc2.toJSON());
};

describe("fountain roundtrip", () => {
  it("single scene heading is stable", () => {
    expect(stableRoundtrip("INT. KITCHEN - DAY\n")).toBe(true);
  });

  it("full scene with all element types is stable", () => {
    const input = [
      "INT. OFFICE - DAY",
      "",
      "A coffee cup steams on the desk.",
      "",
      "      ANNA",
      "      (quietly)",
      "          Hello there.",
      "",
      "CUT TO:",
    ].join("\n");
    expect(stableRoundtrip(input)).toBe(true);
  });

  it("multiple scenes are stable", () => {
    const input = [
      "INT. KITCHEN - DAY",
      "",
      "She pours coffee.",
      "",
      "      BOB",
      "          Ready?",
      "",
      "EXT. STREET - NIGHT",
      "",
      "Rain hammers the cobblestones.",
      "",
      "      ANNA",
      "      (running)",
      "          Not yet!",
      "",
      "FADE OUT:",
    ].join("\n");
    expect(stableRoundtrip(input)).toBe(true);
  });

  it("empty input produces a stable doc", () => {
    expect(stableRoundtrip("")).toBe(true);
  });

  it("blank-line-only input produces a stable doc", () => {
    expect(stableRoundtrip("\n\n\n")).toBe(true);
  });

  it("heals AI-shaped speech at cue indent into a real dialogue block (BUG-N63)", () => {
    // Shape observed in the real project export: the AI writes the spoken
    // line at the same 6-space indent as the cue, with a blank line between.
    // Before the fix the speech became a `character` node and the PDF lost
    // the dialogue block (cue rendered as shot, speech as action).
    const corrupted = [
      "EXT. MURETTO - NOTTE",
      "",
      "Marco parla al telefono.",
      "",
      "      MARCO (V.O.)",
      "",
      "      Luca, ascolta. Non interrompermi.",
    ].join("\n");

    const doc = fountainToDoc(corrupted);
    const bodyTypes: string[] = [];
    doc.firstChild?.forEach((node) => {
      if (node.type.name !== "heading") bodyTypes.push(node.type.name);
    });
    expect(bodyTypes).toEqual(["action", "character", "dialogue"]);

    const healed = docToFountain(doc);
    expect(healed).toContain(
      "      MARCO (V.O.)\n          Luca, ascolta. Non interrompermi.",
    );
    expect(stableRoundtrip(corrupted)).toBe(true);
  });

  it("keeps an opening top-level FADE IN: across the roundtrip", () => {
    const input = ["FADE IN:", "", "INT. KITCHEN - DAY", "", "She waits."].join(
      "\n",
    );
    const fountain = docToFountain(fountainToDoc(input));
    expect(fountain.startsWith("FADE IN:")).toBe(true);
    expect(stableRoundtrip(input)).toBe(true);
  });

  it("docToFountain output re-parses to the same structure as the original doc", () => {
    const input = [
      "EXT. ROOFTOP - DUSK",
      "",
      "The city spreads below.",
      "",
      "      MARIA",
      "          Now or never.",
    ].join("\n");

    const doc1 = fountainToDoc(input);
    const fountain = docToFountain(doc1);
    const doc2 = fountainToDoc(fountain);

    // Compare node types and text — not attrs (scene numbers are computed)
    const structureOf = (doc: ReturnType<typeof fountainToDoc>) =>
      JSON.stringify(doc.toJSON(), (key, val) =>
        key === "number" ? undefined : val,
      );

    expect(structureOf(doc2)).toBe(structureOf(doc1));
  });
});
