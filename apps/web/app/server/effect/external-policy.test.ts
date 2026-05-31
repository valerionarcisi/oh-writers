import { describe, it, expect } from "vitest";
import { Duration, Effect, Exit } from "effect";
import {
  withExternalCallPolicy,
  isTransientHttpStatus,
} from "./external-policy";

// [OHW-048] Spec 48 W-E6 / Circle 4 — the external-resource (Google Places)
// retry/timeout policy. Mirrors the AiClient policy test: a transient failure is
// retried (and can recover), a terminal failure is NEVER retried (cost
// discipline), the retry count is capped, and a per-attempt timeout trips and is
// itself treated as retryable.

interface TestError {
  readonly _tag: "TestError";
  readonly message: string;
  readonly retryable: boolean;
}

const transientError = (): TestError => ({
  _tag: "TestError",
  message: "rate limited",
  retryable: true,
});

const terminalError = (): TestError => ({
  _tag: "TestError",
  message: "bad request",
  retryable: false,
});

const timeoutError = (): TestError => ({
  _tag: "TestError",
  message: "timed out",
  retryable: true,
});

// Tiny delays so backoff is near-instant; short per-attempt timeout so the
// timeout path runs fast and deterministically.
const TEST_OPTIONS = {
  baseDelay: Duration.millis(1),
  maxDelay: Duration.millis(2),
  perAttemptTimeout: Duration.millis(50),
} as const;

const callThatRecoversAfter = (
  failures: number,
  makeError: () => TestError,
): { effect: Effect.Effect<string, TestError>; attempts: () => number } => {
  let attempts = 0;
  const effect = Effect.suspend(() => {
    attempts += 1;
    return attempts <= failures
      ? Effect.fail(makeError())
      : Effect.succeed("ok");
  });
  return { effect, attempts: () => attempts };
};

describe("[OHW-048] isTransientHttpStatus", () => {
  it("classifies 429 and 5xx as transient, other 4xx as terminal", () => {
    expect(isTransientHttpStatus(429)).toBe(true);
    expect(isTransientHttpStatus(500)).toBe(true);
    expect(isTransientHttpStatus(503)).toBe(true);
    expect(isTransientHttpStatus(400)).toBe(false);
    expect(isTransientHttpStatus(403)).toBe(false);
    expect(isTransientHttpStatus(404)).toBe(false);
  });
});

describe("[OHW-048] withExternalCallPolicy", () => {
  it("retries a transient failure and recovers within the budget", async () => {
    const { effect, attempts } = callThatRecoversAfter(2, transientError);
    const exit = await Effect.runPromiseExit(
      withExternalCallPolicy(effect, timeoutError, TEST_OPTIONS),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    // 2 transient failures + 1 success = 3 attempts (within maxRetries=2).
    expect(attempts()).toBe(3);
  });

  it("never retries a terminal failure (fails on the first attempt)", async () => {
    const { effect, attempts } = callThatRecoversAfter(1, terminalError);
    const exit = await Effect.runPromiseExit(
      withExternalCallPolicy(effect, timeoutError, TEST_OPTIONS),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(attempts()).toBe(1);
  });

  it("caps retries at maxRetries (3 total attempts), then fails", async () => {
    // Always transient → exhausts the budget: 1 + maxRetries(2) = 3 attempts.
    const { effect, attempts } = callThatRecoversAfter(99, transientError);
    const exit = await Effect.runPromiseExit(
      withExternalCallPolicy(effect, timeoutError, TEST_OPTIONS),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(attempts()).toBe(3);
  });

  it("a per-attempt timeout maps to a retryable failure and is retried", async () => {
    let attempts = 0;
    // Each attempt hangs past the per-attempt timeout, so every attempt times
    // out. The timeout maps to a retryable error → retried up to the cap.
    const hung = Effect.suspend(() => {
      attempts += 1;
      return Effect.never as Effect.Effect<string, TestError>;
    });
    const exit = await Effect.runPromiseExit(
      withExternalCallPolicy(hung, timeoutError, TEST_OPTIONS),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(attempts).toBe(3);
  });
});
