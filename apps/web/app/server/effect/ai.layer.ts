import { Context, Duration, Effect, Layer, Schedule } from "effect";
import {
  callHaiku,
  AnthropicError,
  type CallHaikuParams,
  type HaikuResult,
} from "~/features/ai";
import { fromResultAsync } from "./interop";

// ─── AiClient service ────────────────────────────────────────────────────────
//
// The single injection point for every model call in the AI bounded context.
// It WRAPS the Vercel AI SDK (`callHaiku` → `generateText`), it does not replace
// it (ADR 48): the AI SDK stays the transport to the model; this Layer adds
// Effect's typed retry / timeout / resource lifecycle once, so the per-server
// hand-rolled retry/error duplication (ADR 48 Circle 3) goes away.
//
// The service is named for its ROLE (model client), not the raw Anthropic SDK,
// because the transport is the AI SDK and the eventual BYOK work resolves
// key+model here.
//
// The Anthropic key never crosses this boundary: `callHaiku` reads it from the
// server env inside `features/ai`, and nothing here logs or returns it.

// ─── Retry / timeout policy (Spec 48 W-E3) ────────────────────────────────────
//
// Conservative by design — cost discipline. A model call is retried ONLY when
// the failure is transient (rate-limit / 5xx / request-timeout), as classified
// once at the SDK boundary into `AnthropicError.retryable`. Auth / validation /
// any unrecognised failure is terminal and surfaces on the first attempt: there
// is no universe where retrying a 401 or a malformed-request 400 succeeds, so
// retrying would only burn latency and tokens.
//
//   - per-attempt timeout: a single model call may not exceed this; a hung call
//     fails (as a retryable timeout) instead of wedging the fiber. Bounded so an
//     interrupted stream tears down promptly.
//   - retries: at most MAX_RETRIES additional attempts (so MAX_RETRIES + 1 calls
//     in the worst case). Small on purpose — every retry is a paid model call.
//   - backoff: exponential from BASE_DELAY, capped at MAX_DELAY, with full
//     jitter so concurrent fibers do not retry in lock-step (thundering herd).

export const AI_CALL_POLICY = {
  perAttemptTimeout: Duration.seconds(60),
  baseDelay: Duration.millis(250),
  maxDelay: Duration.seconds(8),
  maxRetries: 2,
} as const;

export interface AiCallPolicyOptions {
  readonly perAttemptTimeout?: Duration.Duration;
  readonly baseDelay?: Duration.Duration;
  readonly maxDelay?: Duration.Duration;
  readonly maxRetries?: number;
}

// A synthetic retryable cause so a per-attempt timeout flows through the same
// retry gate as a provider-side transient error: a hung call is itself a
// transient condition (408-class). The `isRetryable: true` marker is the
// duck-typed contract `AnthropicError`'s constructor reads to set `retryable`.
const makeTimeoutCause = (
  operation: string,
): Error & { readonly isRetryable: true } =>
  Object.assign(new Error(`request timed out in ${operation}`), {
    isRetryable: true as const,
  });

/**
 * Wrap a single model call (already an `Effect<HaikuResult, AnthropicError>`)
 * with the conservative timeout + retry policy. Extracted from the Layer so the
 * policy is unit-testable against a fake call without a live model — the policy
 * is the deep module; the Layer just binds it to `callHaiku`.
 *
 * `options` overrides exist ONLY for tests (short timeouts / delays); production
 * always uses {@link AI_CALL_POLICY}.
 */
export const withAiCallPolicy = (
  call: Effect.Effect<HaikuResult, AnthropicError>,
  operation: string,
  options: AiCallPolicyOptions = {},
): Effect.Effect<HaikuResult, AnthropicError> => {
  const perAttemptTimeout =
    options.perAttemptTimeout ?? AI_CALL_POLICY.perAttemptTimeout;
  const baseDelay = options.baseDelay ?? AI_CALL_POLICY.baseDelay;
  const maxDelay = options.maxDelay ?? AI_CALL_POLICY.maxDelay;
  const maxRetries = options.maxRetries ?? AI_CALL_POLICY.maxRetries;

  // Exponential backoff + full jitter, capped at maxDelay, bounded to maxRetries
  // recurrences, and gated on the retryable predicate so a terminal (auth /
  // validation) failure is NEVER retried.
  const retryPolicy = Schedule.exponential(baseDelay).pipe(
    Schedule.jittered,
    Schedule.either(Schedule.spaced(maxDelay)),
    Schedule.compose(Schedule.recurs(maxRetries)),
    Schedule.whileInput((error: AnthropicError) => error.retryable),
  );

  return call.pipe(
    // A per-attempt timeout that maps to a RETRYABLE `AnthropicError`: a hung
    // call is itself a transient condition, so it can back off and retry rather
    // than fail the whole turn. The error carries no internal detail.
    Effect.timeoutFail({
      duration: perAttemptTimeout,
      onTimeout: () =>
        new AnthropicError(operation, makeTimeoutCause(operation)),
    }),
    Effect.retry(retryPolicy),
  );
};

export interface AiClient {
  readonly callHaiku: (
    params: CallHaikuParams,
    operation: string,
  ) => Effect.Effect<HaikuResult, AnthropicError>;
}

export const AiClient = Context.GenericTag<AiClient>("ai/AiClient");

const callWithPolicy = (
  params: CallHaikuParams,
  operation: string,
): Effect.Effect<HaikuResult, AnthropicError> =>
  withAiCallPolicy(fromResultAsync(callHaiku(params, operation)), operation);

export const AiClientLayer = Layer.succeed(AiClient, {
  callHaiku: callWithPolicy,
});
