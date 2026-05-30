import { Context, Effect, Layer } from "effect";

// ─── Observability service (Langfuse) ─────────────────────────────────────────
//
// Placeholder observability Layer for the AI bounded context. The shape is the
// contract: `traceEffect(name, effect)` wraps any AI Effect in a named span so
// that, once wired, every AI operation traces for free (ADR 48 Circle 4).
//
// Anthropic SDK calls ALREADY emit Langfuse traces via
// `experimental_telemetry` + the OTEL NodeSDK booted in
// `server/instrumentation.ts`; that wiring is untouched. What's missing is a
// trace around the *Effect* graph (access resolution, tool loop, versioning).
// W-E1 ships the seam as an identity wrapper so callers can adopt it now; the
// real span emission is wired in a later wave without changing this interface.
//
// `traceEffect` is type-transparent: it preserves the wrapped Effect's A, E and
// R channels exactly, so adopting it never alters a caller's types.

export interface Observability {
  readonly traceEffect: <A, E, R>(
    name: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

export const Observability =
  Context.GenericTag<Observability>("ai/Observability");

export const ObservabilityLayer = Layer.succeed(Observability, {
  traceEffect: (_name, effect) => effect,
});
