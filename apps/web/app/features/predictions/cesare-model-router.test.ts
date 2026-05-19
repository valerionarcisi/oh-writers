import { describe, it, expect } from "vitest";
import {
  routeModel,
  tierToModel,
  HAIKU_MODEL,
  SONNET_MODEL,
} from "./cesare-model-router";

describe("routeModel", () => {
  it("routes Italian imperative requests to Sonnet", () => {
    expect(
      routeModel({
        userMessage: "aggiungi 3 candidati per il ristorante",
        page: "locations",
        conversationLength: 0,
      }),
    ).toBe("sonnet");
  });

  it("routes a pure question to Haiku", () => {
    expect(
      routeModel({
        userMessage: "che pensi del personaggio?",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("haiku");
  });

  it("routes a long message (>200 chars) to Sonnet even if it looks like a question", () => {
    const long = "Mi puoi spiegare nel dettaglio cosa significa ".repeat(20) + "?";
    expect(
      routeModel({
        userMessage: long,
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("sonnet");
  });

  it("routes a deep conversation (>4 turns) to Sonnet", () => {
    expect(
      routeModel({
        userMessage: "ok?",
        page: "screenplay",
        conversationLength: 5,
      }),
    ).toBe("sonnet");
  });

  it("defends against empty messages by routing to Sonnet", () => {
    expect(
      routeModel({
        userMessage: "   ",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("sonnet");
  });

  it("treats imperative-in-question hybrid as Sonnet (imperative wins)", () => {
    expect(
      routeModel({
        userMessage: "puoi aggiungere una scena al treatment?",
        page: "treatment",
        conversationLength: 0,
      }),
    ).toBe("sonnet");
  });

  it("defaults short non-imperative non-question utterances to Sonnet", () => {
    expect(
      routeModel({
        userMessage: "interessante",
        page: "screenplay",
        conversationLength: 0,
      }),
    ).toBe("sonnet");
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
