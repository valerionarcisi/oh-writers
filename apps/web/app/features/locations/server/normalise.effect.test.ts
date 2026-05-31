import { describe, it, expect } from "vitest";
import { Cause, Chunk, Effect, Exit, Layer } from "effect";
import { AiClient } from "~/server/effect";
import { AnthropicError, type HaikuResult } from "~/features/ai";
import { LocationNormalisationError } from "../locations.errors";
import { normaliseWithAiEffect } from "./normalise.server";

// [OHW-048] Spec 48 W-E6 — requirement normalisation routed through the AiClient
// Layer. Substitute AiClient Layer (fake forced tool-call) proves success→ok and
// typed-failure→err without a live model.

const NORMALISE_TOOL_NAME = "normalise_requirements";
const PROJECT_ID = "proj-1";

const CONTEXTS = [
  {
    id: "11111111-1111-4111-a111-111111111111",
    name: "Bancone",
    description: null,
    sceneHeadings: ["INT. BAR - GIORNO"],
  },
] as const;

const okVerdictResult: HaikuResult = {
  content: [
    {
      type: "tool_use",
      name: NORMALISE_TOOL_NAME,
      input: {
        verdicts: [
          {
            requirementId: "11111111-1111-4111-a111-111111111111",
            locationType: "bar",
            confidence: 0.9,
          },
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

const taggedFailure = <T>(exit: Exit.Exit<T, LocationNormalisationError>) =>
  Exit.isFailure(exit)
    ? Chunk.toReadonlyArray(Cause.failures(exit.cause)).find(
        (e): e is LocationNormalisationError =>
          e instanceof LocationNormalisationError,
      )
    : undefined;

describe("[OHW-048] normaliseWithAiEffect", () => {
  it("success → the parsed verdicts (ok)", async () => {
    const exit = await Effect.runPromiseExit(
      normaliseWithAiEffect(PROJECT_ID, CONTEXTS).pipe(
        Effect.provide(aiClientReturning(okVerdictResult)),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toHaveLength(1);
      expect(exit.value[0]!.locationType).toBe("bar");
    }
  });

  it("model error → typed LocationNormalisationError (err)", async () => {
    const exit = await Effect.runPromiseExit(
      normaliseWithAiEffect(PROJECT_ID, CONTEXTS).pipe(
        Effect.provide(aiClientFailing()),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const tagged = taggedFailure(exit);
    expect(tagged?._tag).toBe("LocationNormalisationError");
    expect(tagged?.projectId).toBe(PROJECT_ID);
  });

  it("malformed tool input → LocationNormalisationError (Zod parse fail)", async () => {
    const malformed: HaikuResult = {
      content: [
        {
          type: "tool_use",
          name: NORMALISE_TOOL_NAME,
          input: { verdicts: [{ requirementId: "x", locationType: "nope" }] },
        },
      ],
      stopReason: "tool_use",
    };
    const exit = await Effect.runPromiseExit(
      normaliseWithAiEffect(PROJECT_ID, CONTEXTS).pipe(
        Effect.provide(aiClientReturning(malformed)),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(taggedFailure(exit)?._tag).toBe("LocationNormalisationError");
  });
});
