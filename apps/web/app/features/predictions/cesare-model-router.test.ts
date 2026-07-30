import { describe, it, expect } from "vitest";
import {
  routeModel,
  tierToModel,
  FAST_TIER_MODEL,
  QUALITY_TIER_MODEL,
} from "./cesare-model-router";

describe("routeModel", () => {
  // Fast is the default tier (issue #101 cost reversal): questions and everyday
  // scoped edits are fast-tier jobs; quality is reserved for genuinely hard turns.

  it("routes a pure question to the fast tier", () => {
    expect(
      routeModel({
        userMessage: "che pensi del personaggio?",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("fast");
  });

  it("routes an everyday scoped edit to the fast tier (no longer quality)", () => {
    expect(
      routeModel({
        userMessage: "aggiungi 3 candidati per il ristorante",
        page: "locations",
        conversationLength: 0,
      }),
    ).toBe("fast");
  });

  it("routes a small update to the fast tier", () => {
    expect(
      routeModel({
        userMessage: "aggiorna la scaletta e accorcia la scena 2",
        page: "outline",
        conversationLength: 0,
      }),
    ).toBe("fast");
  });

  it("routes a long multi-constraint message (>400 chars) to the quality tier", () => {
    const long =
      "Mi puoi spiegare nel dettaglio cosa significa e come cambia tutto ".repeat(
        10,
      ) + "?";
    expect(long.length).toBeGreaterThan(400);
    expect(
      routeModel({
        userMessage: long,
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("quality");
  });

  it("routes a deep conversation (>8 turns) to the quality tier", () => {
    expect(
      routeModel({
        userMessage: "ok?",
        page: "screenplay",
        conversationLength: 9,
      }),
    ).toBe("quality");
  });

  it("keeps a short back-and-forth of edits on the fast tier (<=8 turns)", () => {
    expect(
      routeModel({
        userMessage: "aggiungi una battuta",
        page: "screenplay",
        conversationLength: 5,
      }),
    ).toBe("fast");
  });

  it("routes a from-scratch rewrite via the classifier's verdict, not text-matching", () => {
    // This used to pass through HEAVY_GENERATION_REGEX. The regex is gone: the
    // classifier assigns write_outline → INTENT_SCALE "document" → quality.
    // If the classifier errors, the plan degrades to the fast tier for the
    // ORCHESTRATOR only — the generation tools carry their own quality tier
    // internally, so the heavy writing itself is never downgraded.
    expect(
      routeModel({
        userMessage: "riscrivi tutta la scaletta da zero",
        page: "outline",
        conversationLength: 0,
        intentScale: "document",
      }),
    ).toBe("quality");
  });

  it("does NOT escalate a scoped rewrite to the quality tier", () => {
    expect(
      routeModel({
        userMessage: "riscrivi la scena 3",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("fast");
  });

  it("routes an empty message to the fast tier (nothing complex to reason about)", () => {
    expect(
      routeModel({
        userMessage: "   ",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("fast");
  });

  // #118, second pass. The first fix added a TRANSLATION_REGEX here — patching
  // the router per phrasing, which cannot scale: users ask in any language,
  // with any typo ("ingelse" already missed it an hour in). The regexes are
  // gone; the tier now derives from the intent the classifier (an LLM, so
  // language- and typo-proof) assigns, via its closed INTENT_SCALE table.
  it("a document-scale classified intent routes to quality, whatever the text", () => {
    for (const userMessage of [
      "puoi farmi una nuova versione scritta in ingelse?", // the live typo
      "traduis le scénario en anglais",
      "si", // even a bare follow-up, once classified as document-scale
    ]) {
      expect(
        routeModel({
          userMessage,
          page: "screenplay",
          conversationLength: 0,
          intentScale: "document",
        }),
      ).toBe("quality");
    }
  });

  it("a scoped classified intent stays on the fast tier", () => {
    expect(
      routeModel({
        userMessage: "correggi il refuso nella battuta di Anna",
        page: "screenplay",
        conversationLength: 0,
        intentScale: "scoped",
      }),
    ).toBe("fast");
  });

  it("without a classifier verdict the structural rules still escalate", () => {
    // No intentScale: length and depth remain the only (language-free) signals.
    expect(
      routeModel({
        userMessage: "x".repeat(500),
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("quality");
  });

  it("INTENT_SCALE marks every whole-document intent as document-scale", async () => {
    const { INTENT_SCALE } = await import("./cesare-intent-classifier");
    for (const intent of [
      "translate_document",
      "write_screenplay",
      "write_treatment",
      "write_outline",
      "macro_rewrite",
    ] as const) {
      expect(INTENT_SCALE[intent], intent).toBe("document");
    }
    for (const intent of ["micro_edit", "question", "rename"] as const) {
      expect(INTENT_SCALE[intent], intent).toBe("scoped");
    }
  });
});

describe("tierToModel", () => {
  it("maps the fast tier to the fast-tier model id", () => {
    expect(tierToModel("fast")).toBe(FAST_TIER_MODEL);
  });

  it("maps the quality tier to the quality-tier model id", () => {
    expect(tierToModel("quality")).toBe(QUALITY_TIER_MODEL);
  });
});
