import { Cause, Effect, Exit, Layer } from "effect";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { ok, err } from "neverthrow";
import { DbLayer } from "./db.layer";
import { AccessLayer } from "./access.layer";
import { AiClientLayer } from "./ai.layer";
import { ObservabilityLayer } from "./langfuse.layer";

// ─── Anti-corruption layer (Effect → ResultShape) ─────────────────────────────
//
// The single seam between the Effect-powered AI bounded context (inside) and
// every `createServerFn` boundary (outside, which must keep returning the
// canonical `ResultShape`). ADR 48: inside is `Effect<A, E, R>`, outside is
// `ResultShape<A, E>` — and exactly ONE place owns that translation.
//
// Translation rules:
//   - Effect success           → `{ isOk: true,  value }`     (ok shape)
//   - Typed failure (E channel) → `{ isOk: false, error }`    (err shape, `_tag`)
//   - Defect (Die / throw)      → re-thrown                    (programming error)
//
// The third rule mirrors the neverthrow contract (error handling convention):
// the typed E channel models expected domain failures and becomes an err shape;
// an unexpected defect is a bug, not a domain condition, so it surfaces as a
// thrown error exactly as an uncaught exception would in a neverthrow handler.
// This keeps the external contract byte-identical to a `toShape(...)` handler.

// The composed foundation environment for AI Effects: Db feeds Access; the
// model client and observability stand alongside. Provided once here so callers
// never assemble the graph by hand.
export const AiContextLayer = Layer.mergeAll(
  Layer.provide(AccessLayer, DbLayer),
  DbLayer,
  AiClientLayer,
  ObservabilityLayer,
);

type AiContext = Layer.Layer.Success<typeof AiContextLayer>;

/**
 * Pure conversion: an Effect `Exit` → the canonical `ResultShape`. Exported so
 * the translation rules are unit-testable without a live Layer graph.
 */
export const exitToShape = <A, E>(exit: Exit.Exit<A, E>): ResultShape<A, E> => {
  if (Exit.isSuccess(exit)) return toShape(ok(exit.value));
  const failure = Cause.failureOption(exit.cause);
  if (failure._tag === "Some") return toShape(err(failure.value));
  // No typed failure in the cause → a defect or an interruption. The boundary
  // never fabricates a fake domain error: re-throw. Preserve the ORIGINAL
  // thrown value when it is a defect, so a `throw` inside an AI Effect surfaces
  // byte-identically to the same `throw` in a neverthrow handler (e.g.
  // `requireUser()`'s `Error("Unauthenticated")`). Fall back to the
  // pretty-printed cause only for non-defect failures (e.g. interruption).
  const defect = Cause.dieOption(exit.cause);
  throw defect._tag === "Some"
    ? defect.value
    : new Error(Cause.pretty(exit.cause));
};

/**
 * Run a fully-provided Effect (no remaining requirements) and convert its
 * result to the canonical `ResultShape`. The DRY core shared by
 * {@link runAiEffect} and reused by tests with a substitute Layer graph.
 */
export const runEffectToShape = async <A, E>(
  effect: Effect.Effect<A, E>,
): Promise<ResultShape<A, E>> =>
  exitToShape(await Effect.runPromiseExit(effect));

/**
 * Run an AI Effect under the foundation Layers and convert the result to the
 * canonical `ResultShape` for return from a `createServerFn` handler.
 *
 * @param effect an `Effect<A, E, AiContext>` — its requirements must be fully
 * satisfiable by {@link AiContextLayer}; any remaining requirement is a compile
 * error, which is the point (typed dependencies).
 */
export const runAiEffect = <A, E>(
  effect: Effect.Effect<A, E, AiContext>,
): Promise<ResultShape<A, E>> =>
  runEffectToShape(Effect.provide(effect, AiContextLayer));
