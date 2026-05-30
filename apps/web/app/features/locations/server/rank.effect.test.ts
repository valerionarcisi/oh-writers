import { describe, it, expect } from "vitest";
import { Cause, Chunk, Effect, Exit, Layer } from "effect";
import { AiClient } from "~/server/effect";
import { AnthropicError, type HaikuResult } from "~/features/ai";
import { LocationRankError } from "../locations.errors";
import { rankWithAiEffect } from "./rank.server";
import type { RankablePlace } from "../_mocks/rank.fixtures";

// [OHW-048] Spec 48 W-E6 — atmosphere ranking routed through the AiClient Layer.
//
// Exercises the Effect core directly with a SUBSTITUTE AiClient Layer (a fake
// model returning a forced tool-call), proving success→ok and typed-failure→err
// without a live model. In production the same AiClient Layer carries the W-E3
// retry/timeout policy; here it is a deterministic fake.

const RANK_TOOL_NAME = "rank_places";
const REQ_ID = "req-1";

const PLACES: RankablePlace[] = [
  {
    placeId: "p1",
    name: "Trattoria",
    types: ["restaurant"],
    rating: 3.9,
    priceLevel: null,
    editorialSummary: null,
  },
  {
    placeId: "p2",
    name: "Stellato",
    types: ["restaurant"],
    rating: 4.8,
    priceLevel: null,
    editorialSummary: null,
  },
];

const okRankResult: HaikuResult = {
  content: [
    {
      type: "tool_use",
      name: RANK_TOOL_NAME,
      input: {
        rankings: [
          { placeId: "p1", score: 0.3, reason: "tono dimesso" },
          { placeId: "p2", score: 0.9, reason: "atmosfera raffinata" },
        ],
      },
    },
  ],
  stopReason: "tool_use",
};

const aiClientReturning = (result: HaikuResult): Layer.Layer<AiClient> =>
  Layer.succeed(AiClient, { callHaiku: () => Effect.succeed(result) });

const aiClientFailing = (): Layer.Layer<AiClient> =>
  Layer.succeed(AiClient, {
    callHaiku: (_params, operation) =>
      Effect.fail(new AnthropicError(operation, new Error("model exploded"))),
  });

const taggedFailure = <T>(exit: Exit.Exit<T, LocationRankError>) =>
  Exit.isFailure(exit)
    ? Chunk.toReadonlyArray(Cause.failures(exit.cause)).find(
        (e): e is LocationRankError => e instanceof LocationRankError,
      )
    : undefined;

describe("[OHW-048] rankWithAiEffect", () => {
  it("success → verdicts sorted by score descending (ok)", async () => {
    const exit = await Effect.runPromiseExit(
      rankWithAiEffect(REQ_ID, "INT. BAR", PLACES).pipe(
        Effect.provide(aiClientReturning(okRankResult)),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.map((v) => v.placeId)).toEqual(["p2", "p1"]);
      expect(exit.value[0]!.score).toBe(0.9);
    }
  });

  it("model error → typed LocationRankError on the fail channel (err)", async () => {
    const exit = await Effect.runPromiseExit(
      rankWithAiEffect(REQ_ID, "INT. BAR", PLACES).pipe(
        Effect.provide(aiClientFailing()),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const tagged = taggedFailure(exit);
    expect(tagged?._tag).toBe("LocationRankError");
    expect(tagged?.requirementId).toBe(REQ_ID);
  });

  it("malformed tool input → LocationRankError (Zod parse fail)", async () => {
    const malformed: HaikuResult = {
      content: [
        { type: "tool_use", name: RANK_TOOL_NAME, input: { nope: true } },
      ],
      stopReason: "tool_use",
    };
    const exit = await Effect.runPromiseExit(
      rankWithAiEffect(REQ_ID, "INT. BAR", PLACES).pipe(
        Effect.provide(aiClientReturning(malformed)),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(taggedFailure(exit)?._tag).toBe("LocationRankError");
  });
});
