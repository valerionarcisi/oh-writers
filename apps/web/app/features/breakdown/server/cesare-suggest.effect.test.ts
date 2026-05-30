import { describe, it, expect } from "vitest";
import { Cause, Chunk, Effect, Exit, Layer } from "effect";
import { AiClient } from "~/server/effect";
import { AnthropicError, type HaikuResult } from "~/features/ai";
import { suggestWithAiEffect } from "./cesare-suggest.server";

// [OHW-048] Spec 48 W-E6 — breakdown-suggest model call routed through the
// AiClient Layer. Substitute AiClient Layer (fake forced tool-call) proves
// success→ok and typed-failure→err without a live model.

const TOOL_NAME = "submit_breakdown_suggestions";

const okSuggestResult: HaikuResult = {
  content: [
    {
      type: "tool_use",
      name: TOOL_NAME,
      input: {
        suggestions: [
          {
            category: "props",
            name: "Bottiglia di vino",
            quantity: 1,
            description: null,
            rationale: null,
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

describe("[OHW-048] suggestWithAiEffect", () => {
  it("success → the parsed suggestions (ok)", async () => {
    const exit = await Effect.runPromiseExit(
      suggestWithAiEffect("INT. BAR - GIORNO\nDante versa il vino.").pipe(
        Effect.provide(aiClientReturning(okSuggestResult)),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toHaveLength(1);
      expect(exit.value[0]!.name).toBe("Bottiglia di vino");
    }
  });

  it("no tool_use block → empty list (ok, not an error)", async () => {
    const noTool: HaikuResult = {
      content: [{ type: "text", text: "nothing to extract" }],
      stopReason: "stop",
    };
    const exit = await Effect.runPromiseExit(
      suggestWithAiEffect("INT. VUOTO").pipe(
        Effect.provide(aiClientReturning(noTool)),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toEqual([]);
  });

  it("model error → typed AnthropicError on the fail channel (err)", async () => {
    const exit = await Effect.runPromiseExit(
      suggestWithAiEffect("INT. BAR").pipe(Effect.provide(aiClientFailing())),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const tagged = Chunk.toReadonlyArray(Cause.failures(exit.cause)).find(
        (e): e is AnthropicError => e instanceof AnthropicError,
      );
      expect(tagged?._tag).toBe("AnthropicError");
    }
  });
});
