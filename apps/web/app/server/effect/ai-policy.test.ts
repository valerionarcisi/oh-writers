import { describe, it, expect } from "vitest";
import { Duration, Effect, Exit } from "effect";
import { withAiCallPolicy } from "./ai.layer";
import { AnthropicError, type HaikuResult } from "~/features/ai";

// The retry/timeout policy on the AiClient Layer (Spec 48 W-E3). These tests
// exercise `withAiCallPolicy` directly against a fake model call so the policy
// is verified without a live model: a transient failure is retried (and can
// recover), an auth/validation failure is NEVER retried (cost discipline), the
// retry count is capped, and a per-attempt timeout trips and is itself treated
// as retryable.

const OK_RESULT: HaikuResult = { content: [], stopReason: "stop" };

// Test overrides: tiny delays so backoff is near-instant; a short per-attempt
// timeout so the timeout path runs fast and deterministically.
const TEST_OPTIONS = {
  baseDelay: Duration.millis(1),
  maxDelay: Duration.millis(2),
  perAttemptTimeout: Duration.millis(50),
} as const;

// A retryable (transient) error: the AI SDK's `isRetryable` flag is the source
// of truth, mirrored by `AnthropicError.retryable`.
const transientError = () =>
  new AnthropicError("test", { isRetryable: true, message: "rate limited" });

// A terminal error: no `isRetryable` flag → `retryable === false`. Models a
// 401/403/400 (auth/validation), which must never be retried.
const terminalError = () =>
  new AnthropicError("test", new Error("invalid api key"));

// A fake model call that fails the first `failures` attempts, then succeeds.
const callThatRecoversAfter = (
  failures: number,
  makeError: () => AnthropicError,
): {
  effect: Effect.Effect<HaikuResult, AnthropicError>;
  attempts: () => number;
} => {
  let attempts = 0;
  const effect = Effect.suspend(() => {
    attempts += 1;
    return attempts <= failures
      ? Effect.fail(makeError())
      : Effect.succeed(OK_RESULT);
  });
  return { effect, attempts: () => attempts };
};

describe("[OHW-048] AiClient retry/timeout policy", () => {
  it("retries a transient failure and recovers within the retry budget", async () => {
    const { effect, attempts } = callThatRecoversAfter(2, transientError);
    const exit = await Effect.runPromiseExit(
      withAiCallPolicy(effect, "test", TEST_OPTIONS),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    // 2 transient failures + 1 success = 3 attempts (within maxRetries=2).
    expect(attempts()).toBe(3);
  });

  it("does NOT retry an auth/validation (terminal) failure — fails on first attempt", async () => {
    const { effect, attempts } = callThatRecoversAfter(
      Number.POSITIVE_INFINITY,
      terminalError,
    );
    const exit = await Effect.runPromiseExit(
      withAiCallPolicy(effect, "test", TEST_OPTIONS),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    // A terminal error is never retried: exactly one attempt.
    expect(attempts()).toBe(1);
  });

  it("caps retries at maxRetries when the failure stays transient", async () => {
    const { effect, attempts } = callThatRecoversAfter(
      Number.POSITIVE_INFINITY,
      transientError,
    );
    const exit = await Effect.runPromiseExit(
      withAiCallPolicy(effect, "test", { ...TEST_OPTIONS, maxRetries: 2 }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    // 1 initial + 2 retries = 3 attempts, then the budget is exhausted.
    expect(attempts()).toBe(3);
  });

  it("preserves the typed AnthropicError on the failure channel (no defect)", async () => {
    const { effect } = callThatRecoversAfter(
      Number.POSITIVE_INFINITY,
      terminalError,
    );
    const exit = await Effect.runPromiseExit(
      withAiCallPolicy(effect, "test", TEST_OPTIONS),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause;
      // The error stays in the typed E channel, tag preserved.
      expect(JSON.stringify(failure)).toContain("AnthropicError");
    }
  });

  it("trips the per-attempt timeout and treats it as retryable, then exhausts the budget", async () => {
    // A call that never settles within the per-attempt timeout. Each attempt
    // times out → retryable AnthropicError → retried up to maxRetries, then fails.
    let attempts = 0;
    const hangingCall = Effect.suspend(() => {
      attempts += 1;
      return Effect.never as Effect.Effect<HaikuResult, AnthropicError>;
    });
    const exit = await Effect.runPromiseExit(
      withAiCallPolicy(hangingCall, "test", {
        ...TEST_OPTIONS,
        maxRetries: 1,
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    // The timeout is itself retryable: 1 initial attempt + 1 retry = 2 attempts.
    expect(attempts).toBe(2);
  });

  it("a fast successful call is never retried (single attempt)", async () => {
    const { effect, attempts } = callThatRecoversAfter(0, transientError);
    const exit = await Effect.runPromiseExit(
      withAiCallPolicy(effect, "test", TEST_OPTIONS),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(attempts()).toBe(1);
  });
});
