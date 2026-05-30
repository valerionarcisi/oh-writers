import { Context, Duration, Effect, Layer, Schedule } from "effect";
import {
  callHaiku,
  AnthropicError,
  type CallHaikuParams,
  type HaikuResult,
} from "~/features/ai";
import { fromResultAsync } from "./interop";

// ─── AnthropicClient service ─────────────────────────────────────────────────
//
// The single injection point for every Anthropic call in the AI bounded
// context. Today each AI server re-implements retry/error handling by hand (a
// DRY violation, see ADR 48 Circle 3); this Layer is where that policy will be
// declared ONCE.
//
// W-E1 establishes the Layer + the typed `Effect` interface only. The
// retry/timeout policy below is an intentionally conservative PLACEHOLDER —
// hardened in W-E3/W-E5:
//   - `RETRY_SCHEDULE` is `Schedule.stop` → zero retries, so behaviour is
//     byte-identical to calling `callHaiku` directly. No silent retry is
//     introduced before the error taxonomy (retryable vs terminal) is defined.
//   - `REQUEST_TIMEOUT` is generous enough never to trip on a healthy call; it
//     exists so the Layer already owns the timeout seam. A timeout surfaces as
//     an `AnthropicError` so the failure channel type is unchanged.
//
// The Anthropic key never crosses this boundary: `callHaiku` reads it from the
// server env inside `features/ai`, and nothing here logs or returns it.

const REQUEST_TIMEOUT = Duration.seconds(120);
const RETRY_SCHEDULE = Schedule.stop;

export interface AnthropicClient {
  readonly callHaiku: (
    params: CallHaikuParams,
    operation: string,
  ) => Effect.Effect<HaikuResult, AnthropicError>;
}

export const AnthropicClient =
  Context.GenericTag<AnthropicClient>("ai/AnthropicClient");

const callWithPolicy = (
  params: CallHaikuParams,
  operation: string,
): Effect.Effect<HaikuResult, AnthropicError> =>
  fromResultAsync(callHaiku(params, operation)).pipe(
    Effect.timeoutFail({
      duration: REQUEST_TIMEOUT,
      onTimeout: () =>
        new AnthropicError(operation, new Error("request timed out")),
    }),
    Effect.retry(RETRY_SCHEDULE),
  );

export const AnthropicClientLayer = Layer.succeed(AnthropicClient, {
  callHaiku: callWithPolicy,
});
