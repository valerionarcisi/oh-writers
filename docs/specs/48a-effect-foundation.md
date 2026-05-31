# Spec 48a — Effect-TS foundation (Wave E1)

Status: **Implemented** · 2026-05-30 · Sub-spec of [Spec 48](48-effect-ai-context.md).

Wave E1 of the ADR: the Effect-TS foundation for the **AI bounded context only**.
This wave builds the foundation Layers + the anti-corruption layer (ACL) at the
`createServerFn` seam and proves the flow end-to-end with one small pilot. It
does **not** migrate the Cesare stream or the tool loop (W-E2/W-E3).

The boundary rule is unchanged: **inside** the AI context, code is
`Effect<A, E, R>`; **outside**, every server function still returns the canonical
`ResultShape`. neverthrow and Zod stay everywhere else.

## Dependency

- `effect@3.21.2` (pinned, exact) added to `apps/web`. No Nexus override (this
  repo uses the default registry). Nothing else changed.

## Where it lives

`apps/web/app/server/effect/` — the AI-context Effect foundation, with a barrel
`index.ts`. Kept in `apps/web` (not a shared package): it is tightly coupled to
the server boundary (`createServerFn`, `getDb`, the access prelude) and must not
leak into the framework-agnostic packages.

## The foundation Layers

Each Layer wraps existing, unchanged server logic — no auth/db semantics were
touched. Services are `Context.GenericTag` with explicit interfaces.

### `DbService` (`db.layer.ts`)

```ts
interface DbService {
  readonly db: Db;
}
```

`DbLayer = Layer.effect(DbService, …getDb())`. Wraps the existing `getDb()`
dynamic import. Plain singleton — no `acquireRelease`; the connection lifecycle
stays owned by `@oh-writers/db`. AI Effects depend on `DbService` in their `R`
channel instead of threading `db` by hand.

### `AccessService` (`access.layer.ts`)

```ts
interface AccessService {
  resolveProjectAccess(
    projectId,
    level,
  ): Effect<ProjectAccess, ProjectAccessError>;
  resolveProjectAccessFromHeaders(
    projectId,
    level,
    headers,
  ): Effect<ProjectAccess, ProjectAccessError>;
}
```

`AccessLayer = Layer.effect(AccessService, …)` and **depends on `DbService`**
(`Layer.provide(AccessLayer, DbLayer)` in the ACL). A thin adapter over the
existing `requireProjectAccess` / `requireProjectAccessWithHeaders`:

- **Auth semantics unchanged.** The headers-explicit variant still resolves the
  Better Auth session from the request `Headers` (the recent stream-route fix);
  the ambient variant still uses `getWebRequest()`.
- The existing `ProjectAccessError` union (ProjectNotFound / Forbidden / Db) is
  carried on Effect's `E` channel.

### `AnthropicClient` (`anthropic.layer.ts`)

```ts
interface AnthropicClient {
  callHaiku(params, operation): Effect<HaikuResult, AnthropicError>;
}
```

The single injection point for every Anthropic call (today the retry/error logic
is duplicated per AI server — a DRY violation). Wraps the existing
`features/ai` `callHaiku`. The retry/timeout policy is an **intentional
placeholder**, to be hardened in W-E3/W-E5:

- `RETRY_SCHEDULE = Schedule.stop` → **zero retries**, so behaviour is
  byte-identical to calling `callHaiku` directly. No silent retry is introduced
  before the retryable-vs-terminal error taxonomy exists.
- `REQUEST_TIMEOUT = 120s`, generous enough never to trip a healthy call; it
  exists so the Layer already owns the timeout seam. A timeout surfaces as an
  `AnthropicError`, so the failure-channel type is unchanged.

The Anthropic key never crosses this boundary — `callHaiku` reads it from the
server env inside `features/ai`; nothing here logs or returns it.

### `Observability` / Langfuse (`langfuse.layer.ts`)

```ts
interface Observability {
  traceEffect<A, E, R>(name, effect: Effect<A, E, R>): Effect<A, E, R>;
}
```

Placeholder observability Layer. The shape is the contract: `traceEffect` wraps
any AI Effect in a named span. It is **type-transparent** (preserves A/E/R), so
adopting it never changes a caller's types. Anthropic SDK calls already emit
Langfuse traces via `experimental_telemetry` + the OTEL NodeSDK
(`server/instrumentation.ts`, untouched); the real span emission around the
Effect graph is wired in a later wave behind this same interface.

## The anti-corruption layer (`acl.ts`)

The **single** translation point Effect → `ResultShape`.

- `AiContextLayer = Layer.mergeAll(Layer.provide(AccessLayer, DbLayer), DbLayer, AnthropicClientLayer, ObservabilityLayer)`
  — the composed foundation environment, assembled once.
- `exitToShape(exit)` — pure conversion, exported for unit tests:
  - Effect **success** → `{ isOk: true, value }` (ok shape)
  - Typed **failure** (E channel) → `{ isOk: false, error }` (err shape, `_tag` preserved)
  - **Defect** (Die / thrown) → re-thrown, preserving the **original thrown
    value** (a non-defect interruption falls back to the pretty-printed cause).
    Mirrors the neverthrow contract: the typed `E` channel models expected
    domain failures; an unexpected defect is a bug, not a domain condition, so
    it surfaces as a thrown error — byte-identical to the same `throw` in a
    neverthrow handler (e.g. `requireUser()`'s `Error("Unauthenticated")`). The
    boundary never fabricates a fake domain error.
- `runEffectToShape(effect)` — runs a fully-provided Effect and applies
  `exitToShape`. DRY core, reused by tests with a substitute Layer.
- `runAiEffect(effect)` — provides `AiContextLayer`, then `runEffectToShape`.
  This is the production entry point used by handlers. Its parameter type forces
  the Effect's `R` to be satisfiable by the foundation Layers — a missing
  requirement is a **compile error** (the typed-dependency win).

The neverthrow⇄Effect bridge (`interop.ts`) `fromResultAsync` lifts a
`ResultAsync<A, E>` (a non-rejecting thenable) into `Effect<A, E>`, routing the
settled `Result` into Effect's success/failure channel. One copy, used by every
Layer that wraps existing neverthrow logic.

## The pilot

**`getScreenplayProposals`** (`features/predictions/cesare-proposals.server.ts`)
— the smallest real AI-context server read: resolve the screenplay's project →
gate project access (`view`) → return the in-memory proposals bucket.

Converted to: `runAiEffect(loadProposals(screenplayId))`, where `loadProposals`
is an `Effect<ProposalsView, ProposalAccessError, DbService | AccessService>`
that pulls `db` from the **Db Layer** and access from the **Access Layer**.

- The project resolver was split into a db-bound core
  (`resolveScreenplayProjectWithDb`) so the Effect path uses the Layer's handle;
  a thin `getDb()` wrapper preserves the other three (still-neverthrow) handlers.
- `requireUser()`'s throw-on-no-session is preserved via
  `Effect.promise(() => requireUser())` → a defect the ACL re-throws, matching
  the previous `await requireUser()`.

**External contract is unchanged.** Same input schema, same return type
`Promise<ResultShape<ProposalsView, ProposalAccessError>>`, same ok/err branches
with the same `_tag`s. The client caller is untouched. The other three handlers
in the file remain on neverthrow — per-feature reversibility.

## Tests

`apps/web/app/server/effect/effect-foundation.test.ts` (tag `OHW-048`, 7 tests):

- bridge: ok `ResultAsync` → Effect success; err `ResultAsync` → Effect failure
  with `_tag` preserved;
- ACL: success → ok shape; typed failure → err shape (`_tag` + message); defect
  → re-thrown (never a fabricated domain error);
- requirement provision: an Effect that **requires** a service runs only once a
  Layer provides it (success path + typed-failure path).

Results: 7/7 new tests pass. `tsc --noEmit` green. Full `pnpm test:unit` green —
135 files / 1442 tests, no regressions.

## Follow-ups (not in this wave)

- W-E2: Cesare stream → `Stream` + interruption.
- W-E3/W-E5: harden `AnthropicClient` retry/timeout (replace the placeholders).
- Langfuse: wire `traceEffect` to real spans around the Effect graph.
- CLAUDE.md error-handling rule to be scoped ("inside `features/predictions/`
  and AI server fns, Effect is the error/effect model, still no raw try/catch")
  — per ADR 48; deferred until more of the AI context is migrated.
