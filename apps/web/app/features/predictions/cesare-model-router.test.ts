import { describe, it, expect } from "vitest";
import {
  routeModel,
  tierToModel,
  HAIKU_MODEL,
  SONNET_MODEL,
} from "./cesare-model-router";

describe("routeModel", () => {
  // Haiku is the default tier (issue #101 cost reversal): questions and everyday
  // scoped edits are Haiku jobs; Sonnet is reserved for genuinely hard turns.

  it("routes a pure question to Haiku", () => {
    expect(
      routeModel({
        userMessage: "che pensi del personaggio?",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("haiku");
  });

  it("routes an everyday scoped edit to Haiku (no longer Sonnet)", () => {
    expect(
      routeModel({
        userMessage: "aggiungi 3 candidati per il ristorante",
        page: "locations",
        conversationLength: 0,
      }),
    ).toBe("haiku");
  });

  it("routes a small update to Haiku", () => {
    expect(
      routeModel({
        userMessage: "aggiorna la scaletta e accorcia la scena 2",
        page: "outline",
        conversationLength: 0,
      }),
    ).toBe("haiku");
  });

  it("routes a long multi-constraint message (>400 chars) to Sonnet", () => {
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
    ).toBe("sonnet");
  });

  it("routes a deep conversation (>8 turns) to Sonnet", () => {
    expect(
      routeModel({
        userMessage: "ok?",
        page: "screenplay",
        conversationLength: 9,
      }),
    ).toBe("sonnet");
  });

  it("keeps a short back-and-forth of edits on Haiku (<=8 turns)", () => {
    expect(
      routeModel({
        userMessage: "aggiungi una battuta",
        page: "screenplay",
        conversationLength: 5,
      }),
    ).toBe("haiku");
  });

  it("routes a from-scratch rewrite of the whole document to Sonnet", () => {
    expect(
      routeModel({
        userMessage: "riscrivi tutta la scaletta da zero",
        page: "outline",
        conversationLength: 0,
      }),
    ).toBe("sonnet");
  });

  it("does NOT escalate a scoped rewrite to Sonnet", () => {
    expect(
      routeModel({
        userMessage: "riscrivi la scena 3",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("haiku");
  });

  it("routes an empty message to Haiku (nothing complex to reason about)", () => {
    expect(
      routeModel({
        userMessage: "   ",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("haiku");
  });
});

describe("tierToModel", () => {
  it("maps haiku tier to the Haiku model id", () => {
    expect(tierToModel("haiku")).toBe(HAIKU_MODEL);
  });

  it("maps sonnet tier to the Sonnet model id", () => {
    expect(tierToModel("sonnet")).toBe(SONNET_MODEL);
  });
});
