import { describe, it, expect } from "vitest";
import { DocumentTypes } from "@oh-writers/domain";
import {
  buildDraftLabel,
  parseScalettaList,
  scalettaToOutlineContent,
  sanitizeLogline,
} from "./cesare-document-tools";

describe("buildDraftLabel", () => {
  it("returns the default label when no hint is given", () => {
    expect(buildDraftLabel(DocumentTypes.LOGLINE)).toBe(
      "draft Cesare · logline",
    );
  });

  it("includes a trimmed hint inside parentheses", () => {
    expect(
      buildDraftLabel(DocumentTypes.SOGGETTO, "  più asciutto e tematico  "),
    ).toBe("draft Cesare · soggetto (più asciutto e tematico)");
  });

  it("collapses whitespace runs inside the hint", () => {
    expect(
      buildDraftLabel(DocumentTypes.SYNOPSIS, "focus\n\nsu\tpersonaggio"),
    ).toBe("draft Cesare · sinossi (focus su personaggio)");
  });

  it("truncates a long hint to ~40 chars", () => {
    const longHint = "x".repeat(120);
    const result = buildDraftLabel(DocumentTypes.OUTLINE, longHint);
    expect(result.length).toBeLessThanOrEqual(
      "draft Cesare · scaletta (".length + 40 + 1,
    );
    expect(result.startsWith("draft Cesare · scaletta (")).toBe(true);
  });

  it("falls back to default label for an empty / whitespace hint", () => {
    expect(buildDraftLabel(DocumentTypes.TREATMENT, "   ")).toBe(
      "draft Cesare · trattamento",
    );
    expect(buildDraftLabel(DocumentTypes.TREATMENT, null)).toBe(
      "draft Cesare · trattamento",
    );
  });
});

describe("parseScalettaList", () => {
  it("parses a basic numbered list with descriptions", () => {
    const raw = `1. INT. CASA - GIORNO — Marco entra e trova Anna.
2. EXT. PIAZZA - GIORNO — La troupe arriva.
3. INT. BAR - SERA — Conflitto al tavolo.`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(3);
    expect(scenes[0]).toEqual({
      number: 1,
      heading: "INT. CASA - GIORNO",
      description: "Marco entra e trova Anna.",
    });
    expect(scenes[2]?.heading).toBe("INT. BAR - SERA");
  });

  it("tolerates parentheses style numbering '1)'", () => {
    const raw = `1) INT. CASA - GIORNO: Marco entra.
2) EXT. STRADA - NOTTE: Inseguimento.`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(2);
    expect(scenes[1]?.number).toBe(2);
    expect(scenes[1]?.heading).toBe("EXT. STRADA - NOTTE");
  });

  it("accepts 'Scena N' prefix", () => {
    const raw = `Scena 1 — INT. CASA - GIORNO — Marco entra.
Scena 2 — EXT. PARCO - GIORNO — Anna corre.`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.heading).toBe("INT. CASA - GIORNO");
  });

  it("appends continuation lines to the previous scene's description", () => {
    const raw = `1. INT. CASA - GIORNO
Marco entra.
Trova Anna alla finestra.
2. EXT. STRADA - NOTTE
Inseguimento.`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.description).toBe(
      "Marco entra. Trova Anna alla finestra.",
    );
    expect(scenes[1]?.description).toBe("Inseguimento.");
  });

  it("returns an empty array when no numbered scene is present", () => {
    expect(parseScalettaList("")).toEqual([]);
    expect(parseScalettaList("just some prose without numbers")).toEqual([]);
  });

  it("ignores invalid numbers (0, NaN)", () => {
    const raw = `0. NOT A SCENE — should be ignored
1. INT. CASA - GIORNO — valid`;
    const scenes = parseScalettaList(raw);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.number).toBe(1);
  });
});

describe("scalettaToOutlineContent", () => {
  it("wraps scenes into one act / one sequence", () => {
    const parsed = [
      { number: 1, heading: "INT. A", description: "alpha" },
      { number: 2, heading: "EXT. B", description: "beta" },
    ];
    const out = scalettaToOutlineContent(parsed, "test");
    expect(out.acts).toHaveLength(1);
    expect(out.acts[0]?.title).toBe("Atto unico");
    expect(out.acts[0]?.sequences[0]?.scenes).toHaveLength(2);
    expect(out.acts[0]?.sequences[0]?.scenes[0]).toMatchObject({
      heading: "INT. A",
      description: "alpha",
      characters: [],
      pageEstimate: null,
      notes: null,
    });
  });

  it("returns an empty acts array for an empty parsed list", () => {
    expect(scalettaToOutlineContent([], "test")).toEqual({ acts: [] });
  });

  it("assigns stable ids using the seed", () => {
    const parsed = [{ number: 1, heading: "INT. A", description: "" }];
    const out = scalettaToOutlineContent(parsed, "seed-X");
    expect(out.acts[0]?.id).toContain("seed-X-act");
    expect(out.acts[0]?.sequences[0]?.id).toContain("seed-X-seq");
    expect(out.acts[0]?.sequences[0]?.scenes[0]?.id).toContain("seed-X-scene");
  });
});

describe("sanitizeLogline", () => {
  it("keeps a short logline unchanged (sans wrap quotes)", () => {
    expect(sanitizeLogline("Un giovane regista torna a casa.")).toBe(
      "Un giovane regista torna a casa.",
    );
  });

  it("strips surrounding double / italian quotes", () => {
    expect(sanitizeLogline('"Un regista torna a casa."')).toBe(
      "Un regista torna a casa.",
    );
    expect(sanitizeLogline("«Un regista torna a casa.»")).toBe(
      "Un regista torna a casa.",
    );
  });

  it("collapses multi-line / multi-paragraph output to the first paragraph, single line", () => {
    const raw = `Un regista torna a casa.

Ma il paese non vuole essere raccontato.`;
    expect(sanitizeLogline(raw)).toBe("Un regista torna a casa.");
  });

  it("hard caps at 200 characters", () => {
    const raw = `Un protagonista che ${"x".repeat(500)}`;
    const out = sanitizeLogline(raw);
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("collapses internal whitespace runs", () => {
    expect(sanitizeLogline("Un\t\t  regista\n  torna.")).toBe(
      "Un regista torna.",
    );
  });
});
