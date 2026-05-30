# Spec 48b — Cesare stream → Effect (Wave E2)

Status: **Implemented** · 2026-05-30 · Sub-spec of [Spec 48](48-effect-ai-context.md).

Wave E2 of the ADR: convert the **streamed** Cesare path to Effect, consuming the
W-E1 foundation Layers ([Spec 48a](48a-effect-foundation.md)). The headline win is
**structured interruption** — closing the Cesare drawer / aborting the browser
fetch now ACTUALLY cancels the server-side run; the in-flight model call tears
down and no work leaks. Effect WRAPS the Vercel AI SDK (`generateText`); it does
not replace it.

The boundary rule is unchanged: Effect lives only inside `features/predictions/`

- the stream route. neverthrow + Zod elsewhere are untouched. No raw `try/catch`.

## What changed

### `cesare-stream.effect.ts` (new) — the run as an Effect fiber

The streamed turn is modelled as an Effect fiber under the W-E1 `AiContextLayer`
(Db + Access + AiClient + Observability):

- `buildCesareEventStream(run, headers, layer?)` returns the response
  `ReadableStream<Uint8Array>`. Events flow through an Effect `Queue`; the
  `ReadableStream.pull` drains the queue into NDJSON bytes; `ReadableStream.cancel`
  (fired when the browser aborts the fetch) interrupts the fiber.
- `runIntoQueue` resolves project access from the request `Headers` via the
  **Access Layer** (`resolveProjectAccessFromHeaders` — the canonical W-E1 seam),
  bridges the neverthrow V2 handler into Effect (`Effect.promise` over the
  `ResultAsync`, exactly the W-E1 interop shape), and offers the terminal
  `done` / `error` event last — mirroring the previous route's `result.match`.
- A fiber-owned `AbortController` is registered with `Effect.addFinalizer`. On
  ANY exit — success, failure, or **interruption** — the finalizer aborts the
  controller. The signal is threaded into the AI SDK `generateText` call, so an
  interrupted fiber tears the model request down.
- An internal `END` sentinel is offered into the queue once the fiber settles
  (`Effect.onExit`), so a `pull` blocked on `Queue.take` always wakes and closes
  the response deterministically — including after interruption (no terminal
  event is produced on cancel, but END still arrives).
- `layer` defaults to the production `AiContextLayer`; tests inject a substitute
  Db/Access Layer (the same test seam W-E1's ACL uses) so the pipeline and the
  interruption path run without a live database.

### AbortSignal ↔ interruption bridge

The bridge is threaded additively through the existing call chain — every new
parameter is optional and trailing, so the non-streaming `askCesare` path is
byte-identical (signal `undefined` → no abort wiring):

```
stream.ts → runCesareStreamWithAccess(…, abortSignal)
          → handleAskCesareV2(…, onStreamEvent, abortSignal)
          → callCesareV2(…, onStreamEvent, abortSignal)
          → runUnifiedToolLoop(…, onStreamEvent, forcedFirstTool, abortSignal)
          → runGenericToolLoop({ …, abortSignal })
          → generateText({ …, abortSignal })   // AI SDK honours it
```

The legacy mock loop (`runLegacyToolLoop`, MOCK_AI without a mock model) also
checks `abortSignal.aborted` between iterations as a belt-and-suspenders stop.

### `stream.ts` route

Now backed by `buildCesareEventStream`. The pre-flight neverthrow access check
(HTTP **403** contract) is **kept** so a denied caller gets 403 before any stream
opens — the exact status the client relies on. Access is resolved twice from the
request's OWN headers (pre-flight neverthrow for the status, then the Access
Layer inside the fiber for the canonical W-E1 seam), both with identical auth
semantics.

## MUST KEEP IDENTICAL — verified

- **Wire format**: the NDJSON typed event contract
  (`reasoning | reading | writing | tool | done | error`) is byte-identical. The
  client (`cesare-stream-client.ts`, `use-cesare-chat.ts`) needs **zero** changes.
- **Markers**: `done.result` carries the verbatim reply with every `<!--ohw:…-->`
  side-channel marker; `done.toolsExecuted` is `parseToolsExecutedMarker(reply)`.
- **Auth**: project access resolved from `request.headers` via
  `resolveProjectAccessFromHeaders`; the Anthropic key never reaches the client.
- **Cross-domain**: the `tool → entity` mapping is unchanged (the tool loop still
  emits `writing{target}` regardless of page).
- **`ResultShape`** at every non-stream boundary (`askCesare`) is untouched.
- **Tracer invariant** (CLAUDE.md): every turn still streams its live step trace.

## Retry / timeout seam

The AiClient Layer's retry/timeout (W-E1 placeholder: `Schedule.stop` + 120s) is
the wired seam; hardening (the retryable-vs-terminal taxonomy) stays deferred to
W-E3 per the ADR. No silent retry is introduced here.

## Tests

- `cesare-stream.effect.test.ts` (tag `OHW-048`, 3 tests):
  - the live step events serialise as NDJSON in order, then the terminal `done`
    (markers + tool count preserved) — wire format unchanged;
  - a typed handler failure yields a terminal `error` event (user-facing IT
    message only, never the internal cause);
  - **interruption**: cancelling the `ReadableStream` interrupts the fiber, fires
    the bridged `AbortSignal` (`signal.aborted === true`), and stops emission — a
    late handler settle is dropped into the closed stream.
- E2E `tests/cesare-agentic-stream-roundtrip.spec.ts`:
  - the existing `[OHW-047-A1]` / `[OHW-047-A2]` specs pass unchanged (same wire
    format);
  - new `[OHW-048-A3]`: an aborted stream fetch rejects promptly with
    `AbortError` (the server `cancel` fired) AND a follow-up normal turn still
    streams to `done` (the cancelled run did not wedge the server).

Results: 3/3 new unit tests, 7/7 stream E2E (mock-ui), full `pnpm test:unit`
green (136 files / 1445 tests). `tsc --noEmit` green. Verified live (dev,
MOCK_AI): the write turn streams `writing → reasoning → done` (soggetto v2
applied live, change-trace rendered) and a normal turn streams `reasoning → done`.

## Follow-ups (not in this wave)

- W-E3: tool loop → `Effect.all` + harden the AiClient retry/timeout.
- W-E4: auto-versioning → `acquireRelease`.
- Langfuse: wire `traceEffect` to real spans around the Effect graph.
