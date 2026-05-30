# Spec 48 — Effect-TS as the AI orchestration engine (ADR)

Status: **Accepted (direction)** · Decided 2026-05-30 · Not yet implemented (post Spec 47 fleet).

## Decision

Adopt **Effect-TS as the engine of the AI bounded context only** — primarily
`features/predictions/` plus the AI server functions of other features and the
shared LLM client. The rest of the app keeps its current stack
(`neverthrow` `Result`/`ResultAsync`, Zod, TanStack Start, reducer + ts-pattern).

This is **not** a global migration. It is a bounded context with its own stack,
behind an anti-corruption layer at the `createServerFn` seam: **inside** the
boundary code is `Effect<A, E, R>`; **outside** every server function still
returns the canonical `ResultShape`. The seam is the existing one — no new
public surface.

## Why (only where it pays)

The AI surface is where we already hand-roll the things Effect gives for free,
and where the bugs are expensive:

- **Interruption** — user closes the Cesare drawer mid-generation; today the
  stream/timer/fetch cleanup is manual and leaks. Effect `interrupt` propagates
  along the fiber, cleanup guaranteed.
- **Retry / timeout / rate-limit** — Anthropic + Google Places calls. Today the
  same retry/error logic is **duplicated** across every AI server (a DRY
  violation). Effect: `Effect.retry(Schedule.exponential)` + `Effect.timeout`,
  declared once on a shared client `Layer`.
- **Resource lifecycle** — `db` / `access` / Anthropic client / Langfuse trace
  are plumbed by hand (see the Spec 47a workaround: "getWebRequest unavailable
  inside ReadableStream.start"). `Layer` / `Scope` inject them once;
  `acquireRelease` guarantees acquire-before-use and release-on-error.
- **Concurrency** — assembling local context = many DB reads; the universal
  tool loop = many tools. `Effect.all(..., { concurrency })` replaces ad-hoc
  sequential awaits and the races they hide.
- **Typed requirements** — `Effect<A, E, R>` carries the **R** (dependencies)
  in the type; `neverthrow` only carries `E`. For AI code that depends on
  db + ai + access, `R` eliminates the "forgot to pass access" class of bug.

neverthrow already covers typed errors for the rest of the app (70% of Effect's
value there), so Effect outside the AI context is pure overhead and is rejected.

## The boundary rule (apply to every file)

The discriminant is **not** "is this AI/context code?". It is:

> **Use Effect if the code touches an LLM, an external resource (heavy DB
> assembly / Google Places / Redis / websocket), or needs retry / timeout /
> resource lifecycle. Use a pure function (or plain `neverthrow`) if it only
> transforms data or does simple CRUD.**

Concretely:

- **LLM call / external resource / retry / lifecycle → Effect.**
- **Pure data transform (markdown building, formatting, prompt assembly from
  already-loaded data) → pure function**, and it lives in `packages/domain`
  (framework-agnostic, per CLAUDE.md). NOT wrapped in Effect.
- **Simple CRUD (projects, teams, auth, non-AI documents) → neverthrow.**
- **Validation → Zod** (single source of truth) — unchanged. We do NOT replace
  Zod with Effect Schema.
- **React / UI → reducer + ts-pattern** — unchanged.

## Scope — the four concentric circles

### Circle 1 — Core AI orchestration (`features/predictions/`)

- `cesare.server.ts`, `cesare-tools.ts` (tool loop), `cesare-model-router.ts`,
  the `/api/cesare/stream` route, auto-versioning (`applyVersionLive`).
- **In Effect.**

### Circle 2 — Shared LLM client + distillers

- `features/ai/anthropic-client.ts` → becomes the **`AiClient` Layer**:
  the single place that owns retry / timeout / rate-limit / circuit-breaker for
  every model call. **IMPORTANT — keep the Vercel AI SDK.** The app already calls
  the model through the **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`:
  `generateText` / `streamText` / `tool`), NOT raw `@anthropic-ai/sdk`. Effect does
  NOT replace the AI SDK — it WRAPS it. The AI SDK stays the transport to the model
  (streaming, tool-calling, provider abstraction); the `AiClient` Layer wraps those
  SDK calls to add Effect's structured interruption, typed retry/timeout, resource
  lifecycle, and concurrency. So the Layer is named for the model client role
  (`AiClient`/`ModelClient`), not the raw Anthropic SDK. `streamText`'s
  `AbortSignal` is bridged to Effect interruption; AI SDK tool definitions stay.
  - **Captured idea — BYOK (build later, after this Layer exists):** let the user
    save their own Anthropic API key + pick a default model (Haiku/Sonnet/Opus).
    The `AnthropicClient` Layer is the single injection point — it resolves
    key+model from the user context instead of the env. Security (non-negotiable,
    per CLAUDE.md): the key is encrypted at-rest (never plaintext in the DB),
    never logged, never returned to the client, never sent to Langfuse; all
    Anthropic calls stay server-side; validate the key without exposing it; handle
    revoke/expiry/foreign-key rate-limits. Model choice hooks into
    `cesare-model-router.ts`. Scope decided: encrypted-key + model choice (not
    multi-provider). Spec it out when we reach it.
- LLM+db distillers: `bible-distill.server.ts`, `scene-summary.server.ts`,
  `documents/server/logline-from-subject.server.ts`,
  `predictions/context/local-context.server.ts` (DB assembly).
- **In Effect.**
- **NOT** the pure markdown builders: `context/assemble-system-prompt.ts`,
  `context/format-global-context.ts`, `packages/domain/src/context/` — these
  stay pure functions in `domain`.

### Circle 3 — Other features' AI server functions

Each currently re-implements Anthropic retry/error handling by hand (DRY
violation). All move onto the `AnthropicClient` Layer:

- `budget/server/budget.server.ts` (AI cost estimate)
- `breakdown/server/llm-spoglio.server.ts`, `auto-spoglio.server.ts`,
  `breakdown-cost.server.ts`, `cesare-suggest.server.ts`
- `locations/server/rank.server.ts`, `normalise.server.ts`,
  `places-autocomplete.server.ts` (+ Google Places = external resource)
- `schedule/server/schedule.server.ts`
- **In Effect** — but only after Circle 1 is stable.

### Circle 4 — External resources (non-LLM)

- **Langfuse** (`server/instrumentation.ts`) → **observability Layer**, attached
  once, traces every AI `Effect` for free. High value, low cost — do early.
- **Redis** (rate-limit / cache, where used) → `Layer` candidate.
- **Google Places** → same retry/timeout pattern as LLM (covered in Circle 3).
- **`apps/ws-server`** (Yjs + y-websocket collaboration) → `Scope` /
  structured concurrency fit, but it is a separate process with lower
  immediate ROI. **Evaluate later**, not a priority.

## Out of scope (stays as-is)

CRUD (projects/teams/auth/non-AI documents), React/UI, Zod validation, pure
markdown/formatting (in `domain`). The `createServerFn` boundary always exposes
`ResultShape`.

## Migration roadmap (waves)

Orchestrated as waves (the same backbone as the Spec 47 fleet): agents build,
then Design (skip for pure backend) → QA → Lead judge each wave, with
bounce-backs until all judges green, then the user confirms.
`ralph-loop` is used **only** as an internal tool for mechanical, repetitive
conversion (e.g. "convert these 12 tools to the `Effect<...>` shape, repeat
until typecheck + tests green") **inside** an agent — never as the orchestrator;
architectural judgement stays with the judges + the user.

**Each wave ends with screenshots + a report to the user.**

- **W-E1** — Foundation `Layer`s: `Db`, `Access`, **`AnthropicClient`**,
  Langfuse observability. The ACL at `createServerFn` (Effect→`ResultShape`).
- **W-E2** — Cesare stream (`/api/cesare/stream`) → `Stream` with interruption.
- **W-E3** (done — [48c](48c-effect-tool-loop-retry.md)) — Tool loop → Effect +
  real retry/timeout on the client Layer; `AnthropicClient` Layer renamed to
  `AiClient`. (`Effect.all`/concurrency was deliberately NOT applied inside the
  loop — the tracer ordering + agentic-edit semantics require strict sequencing;
  the AI SDK already owns intra-step tool parallelism. Concurrency lands in W-E5.)
- **W-E4** — Auto-versioning → `acquireRelease` (version always created before
  apply, rollback on error guaranteed).
- **W-E5** — LLM distillers (Circle 2): bible-distill, scene-summary,
  logline-from-subject, local-context assembly. **Excludes** pure md builders.
- **W-E6** — Other AI feature servers (Circle 3): budget, breakdown spoglio,
  locations rank/normalise/places, schedule — all onto `AiClient`, dedup (reuse
  `isRetryableModelError` for the retry taxonomy).
- **W-E7** — (evaluate) `ws-server` collaboration.

## Reversibility

The boundary stays `ResultShape`, so any wave is independently revertible: a
feature can move back to neverthrow without touching callers. We migrate
per-domain, never big-bang. (Pragmatic Programmer: keep decisions reversible.)

## Trade-offs / risks

- **Learning curve** — fiber / Layer / Scope is a steep mental model. Mitigated
  by confining Effect to one bounded context and keeping the rest on neverthrow,
  which the team + tooling already know.
- **Two error models in the repo** (Effect inside AI, neverthrow outside). The
  ACL at `createServerFn` is the single translation point; this is intentional
  (a bounded context may have its own stack — DDD), not accidental drift.
- **CLAUDE.md currently mandates neverthrow** ("Never use try/catch for expected
  failures — use ResultAsync"). When W-E1 lands, update CLAUDE.md to scope that
  rule to "outside the AI bounded context; inside `features/predictions/` and AI
  server fns, Effect is the error/effect model, still no raw try/catch".
