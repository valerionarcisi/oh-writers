# Spec 83 — AI Gateway: single choke point for every model call

Status: **Draft**

## Context

Cost diagnosis (2026-07-09) found the Anthropic spend is dominated by **ambient AI
flows** — calls triggered by time spent in the app, not by user intent:

| Flow                                  | Trigger today                                                               | Cost shape                                                    |
| ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Editorial advice (`narrative-polish`) | every 1s typing pause (fingerprint `length:head:tail` churns on every edit) | ~$0.01/call × dozens–hundreds/hour                            |
| Scene summaries                       | every screenplay autosave (2s after last keystroke)                         | ~$0.003/call, continuous; N calls after import                |
| LLM spoglio                           | **Breakdown page mount** (`LLM_FIRST_BREAKDOWN=true`)                       | whole screenplay through Sonnet ≈ $0.5–1/visit after any edit |
| Bible distill                         | global-context fetch with stale fingerprint                                 | Sonnet, all summaries + docs, $0.1–0.3/run                    |

Compounding factors:

- **Three separate entry points** to Anthropic (`callHaiku`/`streamGeneration` via AI
  SDK, the raw streaming SDK client used by spoglio, the Effect `AiClient` layer).
  No single place to enforce budget, record usage, or route models — every past cost
  fix stayed local to one path, which is why none moved the bill.
- **No ledger, no kill switch.** Langfuse ran exactly one day (2026-05-28: $0.81/day,
  84% Sonnet _input_ tokens); the entire heavy-usage period had zero telemetry.
- **Dev runs on the real key** (`MOCK_AI=false` in `apps/web/.env`), so every dev
  session, live-testing loop, and page reload bills.
- Spoglio still calls `claude-sonnet-4-20250514` (deprecated, retirement announced
  for 2026-06-15) and defines a retired Haiku 3.5 ID.

Decisions taken with Valerio (2026-07-09): advice becomes on-save + manual; spoglio
becomes an explicit action; **the gateway is built complete now** (not incrementally);
dev defaults to `MOCK_AI=true`. Marked "Segna" decisions ([[Spec 82]]) must keep
flowing into the prompt context.

## Decision

### 1. One gateway module: `features/ai/gateway`

Every model call in the app goes through a single deep module. No caller imports
`@ai-sdk/anthropic` or `@anthropic-ai/sdk` directly anymore (ESLint `no-restricted-imports`
outside `features/ai/`).

```ts
interface ModelIntent {
  operation: string;                 // e.g. "cesare-tool-loop", "narrative-polish"
  trigger: "user" | "background";    // who asked: explicit user action vs ambient
  tier: "haiku" | "sonnet";          // requested tier (router output or fixed)
  system: SystemBlock[];             // with cache_control, gateway maps to provider
  messages: ModelMessage[];
  maxOutputTokens: number;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  abortSignal?: AbortSignal;
}

// Non-streaming, streaming-text, and tool-loop variants share the same pipeline:
runModel(intent): ResultAsync<ModelResult, AiError>
streamModel(intent, onDelta): ResultAsync<string, AiError>
streamToolLoop(intent, hooks): Effect<...>   // wraps today's cesare-tools loop
```

Pipeline inside the gateway (order matters):

1. **Mock gate** — `MOCK_AI=true` short-circuits to the mock client. The only mock
   check in the codebase.
2. **Budget guard** — reads today's spend from the ledger. Semantics (decided
   2026-07-09, replacing the earlier hard-cap idea — a hard block that fires
   mid-session with a director is worse than the cost it prevents):
   - **`trigger: "user"` calls are never blocked.** They are recorded only.
     Runaway protection for user flows is the existing timeouts (45s/90s),
     `stopWhen(5)` and `maxRetries: 1`.
   - `AI_DAILY_BUDGET_BACKGROUND_USD` (default **1**) — **hard cap** for
     `trigger: "background"` only. Over cap → `AiBudgetExceededError` (typed,
     `_tag`); background flows degrade silently (log + skip, stale data stays).
     A bugged ambient flow stops itself; no user ever notices.
   - `AI_DAILY_BUDGET_USD` (default **5**) — **soft threshold**: crossing it
     logs a structured warning and surfaces a non-blocking UI signal; it never
     rejects a call.
3. **Model resolution** — tier → concrete model ID in ONE table (today:
   `haiku` → `claude-haiku-4-5-20251001`, `sonnet` → `claude-sonnet-5`).
   Spoglio's deprecated `claude-sonnet-4-20250514` and the retired Haiku 3.5 ID are
   deleted; spoglio uses the `sonnet` tier.
4. **Provider call** — AI SDK (`generateText`/`streamText`) for everything, including
   spoglio (which today uses the raw SDK; its `inputJson` incremental parsing moves
   to the AI SDK stream parts). Timeouts and `maxRetries: 1` live here.
5. **Usage recording** — token usage + computed cost written to the `ai_usage`
   ledger and to Langfuse (`experimental_telemetry`), including per-step usage of
   the tool loop.

This module is the **BYOK seam**: user-provided keys / OpenRouter / per-user metering
later change the gateway only. The ledger becomes the per-user bill.

### 2. Ledger: `ai_usage` table (packages/db)

```
id uuid PK, created_at timestamptz NOT NULL default now(),
operation text NOT NULL, model text NOT NULL,
trigger text NOT NULL CHECK (trigger IN ('user','background')),
input_tokens int NOT NULL, output_tokens int NOT NULL,
cache_read_tokens int NOT NULL default 0, cache_write_tokens int NOT NULL default 0,
cost_usd numeric(10,6) NOT NULL
-- index on (created_at)
```

Cost is computed from a static pricing map (per-model $/MTok for input, output,
cache read ×0.1, cache write ×1.25) kept next to the model table. Day boundary for
budgets: UTC (simple; the cap is a safety net, not accounting). `pnpm ai:costs`
prints day × operation × model totals from the ledger. Mock calls are not recorded.

**Known limitation (review 2026-07-09, accepted):** usage is recorded only for
calls that complete — a timed-out (45s/90s abort) or mid-stream-errored
generation bills tokens on Anthropic's side but writes no ledger row, so the
guard undercounts pathological retry/timeout loops. The AI SDK does not expose
usage reliably on the error path; fabricating estimates would corrupt the
ledger. Revisit in Wave 2 (the gateway sees the stream parts and can record
partial usage from the `finish`/`error` metadata where present).

### 3. Trigger policy per flow

| Flow                      | New trigger                                                                                                                                                                                                                       | Class      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Editorial advice          | **on-save** (narrative autosave, 30s) + **Rileggi** button. The 1s content-debounce query is removed; the query key becomes the _saved_ content fingerprint.                                                                      | user       |
| LLM spoglio               | **explicit action**: Breakdown shows a "Spoglio non aggiornato" badge when the screenplay fingerprint changed; the run starts only on button press. No call on mount. `LLM_FIRST_BREAKDOWN` keeps gating the feature server-side. | user       |
| Scene summaries           | still after screenplay save, but debounced **60s per screenplay** (trailing) instead of every 2s-autosave.                                                                                                                        | background |
| Bible distill             | unchanged (fingerprint + in-flight guard), classified background.                                                                                                                                                                 | background |
| Cesare turns / generators | unchanged (user-initiated, router decides tier).                                                                                                                                                                                  | user       |

**Marked-advice context ([[Spec 82]])**: `fetchEditorialAdviceDecisionsBlock` output
is part of the **volatile** prompt section (with the local context), never inside the
cached mega-static block — a "Segna" must not invalidate the whole prefix. The block
is capped (most recent N=40 decisions per document) so it cannot grow unbounded.
Same block feeds both narrative-polish and Cesare turns.

### 4. Dev defaults

`apps/web/.env` ships `MOCK_AI=true`. Real-key sessions (AI smoke tests, director
trials) opt in explicitly per the real-trial workflow. `.env.example` documents both
budget vars.

## Non-goals

- BYOK / OpenRouter itself (future spec; this creates the seam only).
- Per-user budgets or a budget-settings UI (env vars are enough for now).
- Changing the model router heuristics (#101 outcome stands).
- Prompt-content optimization (mega-static layout already correct).

## Migration plan

1. **Ledger + guard + pricing map** in `features/ai` (works with existing entry
   points via a shared `recordUsage`/`assertBudget` pair) — the bleeding stops here.
2. **Gateway facade** wrapping `callHaiku`/`streamGeneration`; migrate all their
   callers (advice, summaries, distill, locations, fundraising, blocking, polish).
3. **Migrate spoglio** off the raw SDK client onto `streamModel`.
4. **Migrate the Cesare tool loop** (`streamToolLoop`, keeps Effect integration,
   per-step usage recording).
5. **Trigger changes** (advice on-save, spoglio button + badge, summaries debounce).
6. **Dev default flip** + ESLint restriction + delete dead model IDs.

## Tests

- `OHW-831` unit (Vitest, `features/ai`): pricing map computes cost from usage
  (incl. cache read/write rates); budget guard blocks at the cap (user error vs
  background skip); mock calls bypass ledger. Happy + sad.
- `OHW-832` unit: gateway resolves tier→model from the single table; unknown tier
  fails fast.
- `OHW-833` E2E (mock, `tests/`): typing in a narrative doc fires **no** advice
  request before save; save (or Rileggi) fires exactly one. Sad path: budget
  exhausted → panel shows the budget error state, not "OK editoriale" (#99 guard).
- `OHW-834` E2E (mock): Breakdown mount fires no spoglio call; stale badge shown
  after screenplay edit; button press runs it.
- `OHW-835` integration: ledger rows written for a tool-loop turn include per-step
  usage and `trigger: "user"`.
