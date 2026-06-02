# Bug 09c (OHW-541b) — expand_section no-ops on slow CI (document-context read race)

Status: **OPEN** · Found 2026-06-02 (de-flake of the Cesare-agentic E2E suite).

## Symptom

The E2E `[OHW-541]` ("Cesare expands a section via expand_section tool") passes
deterministically in local dev (7/7) but fails only on the slow GitHub CI runner.
On CI:

- Cesare's reply matches the success pattern (`/aggiornato|espan|sezione/`) — the
  scripted mock turn-2 text is "Ho espanso la sezione Atto II…".
- But the durable assertion (synopsis `content.length` must grow past the seed)
  fails: the content stays at the seeded length (130) — **the section was never
  actually expanded**.

So `expand_section` reported success while applying a no-op.

## Root cause (hypothesis, to confirm)

The test seeds the synopsis via `/api/test/set-narrative-state` (DB write, polled
back so "## Atto II" is confirmed present in the DB) and waits for "Atto II" to
render in the editor DOM before sending. Yet on CI the `expand_section` executor
does not find the "Atto II" section at execution time and no-ops.

Likely: the executor resolves the section from a **client-passed document
context** (the open editor's content via `pageContext`) rather than re-reading
the freshly-seeded DB content. On a slow CI runner the editor's content → page
context propagation lags, so the executor sees a document without the section,
finds nothing to expand, and returns the no-op — but the mock's scripted success
text fires regardless.

A second, related smell: the mock returns a fixed success reply even when the
real executor errored/no-opped. The "no false success" guard (Bug #4 /
`lastToolResultsErrored`) covers the *errored* case but not a silent *no-op*
(section-not-found that returns empty rather than an error tool_result).

## Where to look

- `apps/web/app/features/predictions/cesare-document-tools.ts` — the
  `expand_section` executor + how it locates the target section + what content
  source it reads (client `documentContext.content` vs a fresh DB read).
- `apps/web/app/features/predictions/cesare.server.ts` ~line 905-945 — the
  `activeDocument` resolution (the f9cd390 by-page fallback) and the
  `documentContext` it builds.
- `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts` line ~143 —
  the expand_section scripted turn; consider whether a section-not-found no-op
  should surface as an error tool_result so the faithful-failure path fires.

## Fix direction

1. Have `expand_section` (and any section-targeting doc tool) read the section
   from the authoritative DB document content for the request, not a possibly
   stale client context — defining the race out of existence (same spirit as the
   activeDocument by-page fallback already added in f9cd390).
2. Make a section-not-found a real error tool_result so the mock/real model
   reports a faithful failure instead of a fabricated success.

## Current mitigation

`tests/cesare-agentic-documents.spec.ts` skips `[OHW-541]` on CI
(`test.skip(!!process.env.CI, …)`) with a pointer to this bug. The test still
runs locally (passes), so the happy path stays covered until the executor is
fixed and the skip can be removed.
