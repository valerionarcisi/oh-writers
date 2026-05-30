import { Cause, Effect, Exit } from "effect";
import { ResultAsync, ok, err, type Result } from "neverthrow";

// ─── neverthrow ⇄ Effect bridge ────────────────────────────────────────────────
//
// The AI bounded context runs on Effect, but the resources it wraps (access
// resolution, db helpers) are still authored in neverthrow. This is the single
// adapter that lifts a neverthrow value into an Effect, preserving the typed
// error channel: `ResultAsync<A, E>` → `Effect<A, E>`. One copy, used by every
// Layer that wraps existing neverthrow logic (DRY).
//
// A neverthrow `ResultAsync` is a thenable that resolves to a `Result` and never
// rejects for domain errors, so `Effect.promise` (the non-throwing variant) is
// the correct lift: we then route the settled `Result` into Effect's
// success/failure channel.

export const fromResultAsync = <A, E>(
  ra: ResultAsync<A, E>,
): Effect.Effect<A, E> =>
  Effect.flatMap(
    Effect.promise(() => ra),
    (result: Result<A, E>) =>
      result.isOk() ? Effect.succeed(result.value) : Effect.fail(result.error),
  );

// The reverse bridge: a fully-provided Effect → `ResultAsync`. Lets an AI Effect
// (e.g. the `acquireRelease` auto-versioning core, W-E4) hand its typed result
// back to a neverthrow consumer without that consumer learning Effect. The typed
// E channel becomes the err branch; a defect (Die / unexpected throw) re-rejects
// the underlying promise exactly as it would have thrown, so programming errors
// stay programming errors — symmetric with the ACL's `exitToShape` rule.
export const toResultAsync = <A, E>(
  effect: Effect.Effect<A, E>,
): ResultAsync<A, E> =>
  ResultAsync.fromSafePromise(Effect.runPromiseExit(effect)).andThen(
    (exit: Exit.Exit<A, E>): Result<A, E> => {
      if (Exit.isSuccess(exit)) return ok(exit.value);
      const failure = Cause.failureOption(exit.cause);
      if (failure._tag === "Some") return err(failure.value);
      // No typed failure → a defect or interruption. Mirror the ACL's
      // `exitToShape` rule: re-throw the original defect so a programming error
      // surfaces as a rejection, never a fabricated domain error.
      const defect = Cause.dieOption(exit.cause);
      throw defect._tag === "Some"
        ? defect.value
        : new Error(Cause.pretty(exit.cause));
    },
  );
