# 36 — autoSpoglio + Cesare concurrent regression test

## Context

Closing the CI saga of 2026-05-22 (commits `a64bcb5` → `08a9273`) we
discovered that `BreakdownPage` kicks off `autoSpoglio.mutate()` on mount.
On slow GitHub runners the resulting layout shift moved the Cesare sheet
textarea/send button out of the viewport mid-test, breaking OHW-543 and
OHW-561 in the `mock-ui` Playwright project.

The pragmatic fix (commit `08a9273`) was: skip the auto-trigger when
`MOCK_AI=true`. The seed already pre-populates breakdown rows so nothing
visible changes in the test fixture, and the dedicated `auto-spoglio.spec.ts`
specs (in the `chromium` project, real-AI build) still exercise the
auto-trigger end-to-end.

**Open hole**: no test exercises the _combined_ "auto-spoglio in flight +
user opens Cesare sheet" interaction. Both paths are covered individually
but not concurrently.

## What to add

A single new spec in the `chromium` Playwright project (real-AI build,
NOT `mock-ui`):

```
tests/breakdown/breakdown-autospoglio-cesare.spec.ts
```

### Scenario

1. Seed the team project with no breakdown rows (so auto-spoglio has work).
2. Navigate to `/projects/<id>/breakdown`.
3. Without waiting for auto-spoglio to finish, open the Cesare sheet.
4. Type a short prompt and submit.
5. Assert the Cesare textarea/send-button stayed interactive (no
   `outside-of-viewport` failure) and a reply came back.
6. Assert the auto-spoglio finished and breakdown rows appeared.

### Why it lives in `chromium`, not `mock-ui`

`mock-ui` runs with `MOCK_AI=true` which now suppresses the auto-trigger
— so a test there would never exercise the concurrency we want to guard.
The `chromium` project runs with the real Anthropic client; if the API
key is absent, the test should gracefully skip via `test.skip(!process.env.ANTHROPIC_API_KEY)`.

### Cost

~30 min to write + run locally. No source-code change needed; the
auto-trigger is already active in non-MOCK_AI builds.

## Acceptance

- The new spec runs green locally with `ANTHROPIC_API_KEY` set.
- The new spec is **not** added to the pre-push hook (it costs real API
  calls). CI runs it only on the nightly job (TBD) or on PR label
  `run-real-ai-e2e`.
- If the spec fails because the Cesare sheet stops being interactive
  during auto-spoglio, the breakdown layout is buggy and the spec gives
  us the early signal instead of a CI surprise.

## Status

- [ ] Spec written
- [ ] Workflow / label gating decided
- [ ] Spec green locally
- [ ] Documented in `docs/architecture.md` as "real-AI E2E lane"
