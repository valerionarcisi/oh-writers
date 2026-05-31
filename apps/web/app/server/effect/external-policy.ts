import { Duration, Effect, Schedule } from "effect";

// ─── External-resource call policy (Spec 48 W-E6 / Circle 4) ──────────────────
//
// The retry/timeout policy for a non-LLM external resource (Google Places). It
// mirrors `withAiCallPolicy` (the model-call policy on the AiClient Layer): one
// per-attempt timeout, a small capped number of retries with exponential backoff
// + full jitter, and — crucially — retries ONLY a transient failure. The ADR
// (Circle 4) calls for "the same retry/timeout pattern as the model calls" for
// Google Places; this is that pattern, factored out so the policy is declared
// once and shared by every external fetch (DRY) rather than re-rolled per server.
//
// `retryable` is decided ONCE at the fetch boundary, where the HTTP status is
// still in hand: rate-limit (429) / 5xx / network error are transient; a 4xx
// (auth / bad request) is terminal and never retried (retrying only burns
// latency on a request that cannot succeed). The error carries no provider
// detail and never the API key.

/**
 * The error a policy-wrapped external call fails with. `retryable` is the single
 * duck-typed signal the retry gate reads; anything that is not explicitly
 * retryable is terminal (fail fast). Generic over the caller's own tagged error
 * `E`, so the external server keeps its existing failure type on the wire.
 */
export interface RetryableError {
  readonly retryable: boolean;
}

// HTTP status → transient? 429 (rate-limit) and 5xx are worth a retry; every
// other status (and a missing status, e.g. a parse error) is terminal.
export const isTransientHttpStatus = (status: number): boolean =>
  status === 429 || (status >= 500 && status <= 599);

export interface ExternalCallPolicyOptions {
  readonly perAttemptTimeout?: Duration.Duration;
  readonly baseDelay?: Duration.Duration;
  readonly maxDelay?: Duration.Duration;
  readonly maxRetries?: number;
}

// Conservative defaults, aligned with the AI call policy: a single external
// request may not exceed the per-attempt timeout (a hung fetch fails as a
// retryable timeout rather than wedging the fiber), at most `maxRetries`
// additional attempts, exponential backoff capped at `maxDelay` with full
// jitter so concurrent fibers do not retry in lock-step.
export const EXTERNAL_CALL_POLICY = {
  perAttemptTimeout: Duration.seconds(15),
  baseDelay: Duration.millis(250),
  maxDelay: Duration.seconds(4),
  maxRetries: 2,
} as const;

/**
 * Wrap a single external call (an `Effect<A, E>` whose `E` carries a `retryable`
 * flag) with the conservative timeout + retry policy. A per-attempt timeout maps
 * to a retryable failure via `onTimeout` (a hung call is itself transient), so it
 * can back off and retry rather than fail the whole turn.
 *
 * `onTimeout` lets the caller build its OWN tagged error for the timeout, so the
 * failure channel stays the server's existing error type (no leak of an Effect
 * internal). `options` overrides exist for tests (short timeouts/delays).
 */
export const withExternalCallPolicy = <A, E extends RetryableError>(
  call: Effect.Effect<A, E>,
  onTimeout: () => E,
  options: ExternalCallPolicyOptions = {},
): Effect.Effect<A, E> => {
  const perAttemptTimeout =
    options.perAttemptTimeout ?? EXTERNAL_CALL_POLICY.perAttemptTimeout;
  const baseDelay = options.baseDelay ?? EXTERNAL_CALL_POLICY.baseDelay;
  const maxDelay = options.maxDelay ?? EXTERNAL_CALL_POLICY.maxDelay;
  const maxRetries = options.maxRetries ?? EXTERNAL_CALL_POLICY.maxRetries;

  const retryPolicy = Schedule.exponential(baseDelay).pipe(
    Schedule.jittered,
    Schedule.either(Schedule.spaced(maxDelay)),
    Schedule.compose(Schedule.recurs(maxRetries)),
    Schedule.whileInput((error: E) => error.retryable),
  );

  return call.pipe(
    Effect.timeoutFail({ duration: perAttemptTimeout, onTimeout }),
    Effect.retry(retryPolicy),
  );
};
