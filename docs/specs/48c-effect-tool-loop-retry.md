# Spec 48c — Tool loop → Effect + real AiClient retry/timeout (Wave E3)

Status: **Implemented** · 2026-05-30 · Sub-spec of [Spec 48](48-effect-ai-context.md).

Wave E3 of the ADR: the Cesare tool loop becomes an Effect, and the AiClient
Layer's placeholder retry/timeout (W-E1: `Schedule.stop` + 120s) is replaced with
a real, conservative policy. Effect WRAPS the Vercel AI SDK; it does not replace
it. The boundary rule is unchanged: Effect lives only inside
`features/predictions/` + `server/effect/`; neverthrow + Zod elsewhere untouched;
no raw `try/catch`.

## What changed

### Tool loop → Effect (`cesare-tools.ts`)

The loop runs as an `Effect` internally, but the PUBLIC functions
(`runGenericToolLoop`, `runUnifiedToolLoop`) still return
`ResultAsync<string, CesareError>` so the frozen W-E2 seam
(`CesareStreamRun.handle`) and the non-streaming `askCesare` path are
byte-identical. One local seam — `toolLoopEffectToResult` — bridges Effect →
neverthrow (the mirror of the global ACL `runAiEffect`), folding any defect into
the typed `CesareError` channel first so the turn always settles (faithful to the
previous `ResultAsync.fromPromise` which funnelled every throw into a
`CesareError`).

- **Production path** (`runProductionToolLoopEffect`) = a single
  `generateText` call wrapped in `Effect.tryPromise`. There is **no manual
  await-loop to parallelise**: the AI SDK owns the multi-step loop
  (`stopWhen: stepCountIs(5)`) AND already runs a step's independent tool
  `execute` callbacks concurrently itself. `Effect.all` would be wrong here — it
  is one async call. The win at this layer is the typed error channel +
  interruption (the bridged `AbortSignal`), not concurrency.
- **Legacy mock path** (`runLegacyToolLoopEffect`) = `Effect.gen`. The outer
  turn iteration stays an ordered imperative `for` (each turn depends on the
  previous turn's messages — inherently sequential). Tool blocks within a turn
  run **strictly serially** (`Effect.forEach`, `concurrency: 1`) **on purpose**:
  parallelising would scramble the tracer step order (the `reading/writing`
  events the user watches live — product invariant) and race the agentic-edit
  auto-version+apply against the same entity. **Correctness over speed.** A tool
  error still becomes a `tool_result` carrying the error (model can recover) —
  identical to the previous `result.isErr()` branch.

**Where concurrency was deliberately NOT applied.** `Effect.all` /
`concurrency > 1` is reserved for genuinely independent, side-effect-free work
(local-context DB assembly, W-E5). Inside the tool loop there is no such batch
that is safe to parallelise without breaking the tracer ordering or the agentic
edit semantics, so none was introduced.

### Real retry/timeout on the AiClient Layer (`ai.layer.ts`)

Replaces the W-E1 placeholder with a conservative, cost-disciplined policy,
extracted into `withAiCallPolicy` (unit-testable against a fake call):

- **Retry** — exponential backoff (`Schedule.exponential` from 250ms) + full
  jitter, capped at 8s, bounded to **2 retries** (3 calls worst case). Gated on a
  retryable predicate, so a terminal failure is **never** retried.
- **Timeout** — a real per-attempt `Effect.timeout` (60s). A hung call is itself
  a transient condition, so the timeout maps to a **retryable** `AnthropicError`
  and re-enters the retry gate.
- **Retryable vs terminal taxonomy** — classified ONCE at the SDK boundary
  (`features/ai`), where the original error object still has its status code:
  `AnthropicError.retryable = isRetryableModelError(cause)`. The source of truth
  is the AI SDK's own `APICallError.isRetryable` (true for 429 / 408 / 409 / 5xx,
  false for auth/validation 4xx), with the same flag honoured duck-typed on a
  synthesised timeout cause. Auth / validation / any unrecognised failure is
  terminal — never retried (retrying only burns cost + latency).

### Rename `AnthropicClient` → `AiClient`

`anthropic.layer.ts` → `ai.layer.ts`; the service / Layer / exports renamed
across `server/effect/` + consumers (`acl.ts`, `index.ts`). Behaviour identical.
The Layer is named for its **role** (model client) because it wraps the Vercel AI
SDK (`callHaiku` → `generateText`), not the raw Anthropic SDK. The rename does
not touch the unrelated `LegacyAnthropicClient` / `MockAnthropic*` (mock-loop)
nor `AnthropicError` / `AnthropicTool`.

## MUST KEEP IDENTICAL — verified

- **Wire format**: NDJSON typed events unchanged; client
  (`cesare-stream-client.ts`, `use-cesare-chat.ts`) needs zero changes.
- **Tracer ordering**: `reading → reasoning → writing → done`, streamed live.
- **Markers**: `<!--ohw:…-->` side-channel markers preserved (tools count,
  doc-applied, live-diff).
- **Auth**: `resolveProjectAccessFromHeaders` (W-E2 fix) untouched; the Anthropic
  key never crosses the AiClient boundary, never logged.
- **Cross-domain** tool→entity mapping unchanged; `ResultShape` at every
  non-stream boundary untouched.
- **AbortSignal** threading from W-E2 intact end-to-end.

## Tests

- `ai-policy.test.ts` (tag `OHW-048`, 6 tests): retries a transient failure and
  recovers; does NOT retry an auth/validation failure (single attempt); caps
  retries at `maxRetries`; preserves the typed `AnthropicError` (no defect); the
  per-attempt timeout trips and is treated as retryable then exhausts the budget;
  a fast success is never retried.
- Existing loop + stream tests green (`cesare-tools`, `cesare-stream.effect`,
  `cesare-document-tools`, `cesare-universal-tools`, `cesare-persist`).
- E2E `tests/cesare-agentic-stream-roundtrip.spec.ts`: `[OHW-047-A1]` /
  `[OHW-047-A2]` / `[OHW-048-A3]` — **7/7 pass** (wire frozen).

Results: `tsc --noEmit` green; full `pnpm test:unit` green (137 files /
1451 tests). Verified live (dev :3002, `MOCK_AI=true`): the write turn ("Fammi un
v2 del soggetto più asciutto.") streams its trace (`1 passaggio → Aggiornato
Soggetto → Fatto → result card`), the soggetto v2 is created and applied LIVE,
"Mostra modifiche" renders the inline diff, "Annulla" is offered; a normal
question streams `reasoning → done`.

## Follow-ups (not in this wave)

- W-E4: auto-versioning → `acquireRelease`.
- W-E5: LLM distillers + local-context assembly (the real `Effect.all`
  concurrency win).
- W-E6: other AI feature servers onto the AiClient Layer — `isRetryableModelError`
  is exported so the per-server hand-rolled retry can be deduped here.
