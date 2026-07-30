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

  it("routes a from-scratch rewrite of the whole document to the quality tier", () => {
    expect(
      routeModel({
        userMessage: "riscrivi tutta la scaletta da zero",
        page: "outline",
        conversationLength: 0,
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

  // #118, observed live 2026-07-30: both messages below were routed to the
  // fast tier (46 and 99 chars, shallow thread), whose model answered a
  // document-scale request by promising background work it cannot do. A
  // translation is never a scoped edit, whatever its length.
  it("routes a short translation request to the quality tier", () => {
    expect(
      routeModel({
        userMessage: "puoi farmi una nuova versione scritta in ingelse?",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("fast"); // typo'd "ingelse" — see next case for the honest limit
    expect(
      routeModel({
        userMessage: "puoi farmi una nuova versione scritta in inglese?",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("quality");
  });

  it("routes explicit translation verbs to the quality tier", () => {
    for (const msg of [
      "traduci la sceneggiatura",
      "mi serve la traduzione del trattamento",
      "translate the screenplay to English",
    ]) {
      expect(
        routeModel({
          userMessage: msg,
          page: "screenplay",
          conversationLength: 0,
        }),
      ).toBe("quality");
    }
  });

  it("does not escalate an everyday edit that merely mentions a language", () => {
    expect(
      routeModel({
        userMessage: "correggi il refuso nella battuta in inglese di Anna",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("fast");
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
