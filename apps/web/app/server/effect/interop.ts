import { Effect } from "effect";
import type { ResultAsync, Result } from "neverthrow";

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
