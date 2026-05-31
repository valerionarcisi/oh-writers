# 48d — Green-the-build report (pre-main E2E)

Bring the merge-gating E2E suite to green before the merge to `main`.

## Base

- Branch base: `integ/ux-notion-v3-qa-iter-1` HEAD `f9dd704`
  (full Effect refactor W-E2…W-E6 + spec 47e flash-highlight + pre-main audit).
- Stale-worktree guard cleared: confirmed `apps/web/app/server/effect/ai.layer.ts`
  (the renamed `AiClient`, not `anthropic.layer.ts`), `external-policy.ts`,
  `features/app-shell/cesare-live-diff-store.ts`, `lib/document-title.ts` all
  present; `anthropic.layer.ts` absent.
- Note: the local branch HEAD was `7b162ba` (W-E1 only) — one merge behind the
  required base. Reset to `f9dd704` so the full Effect stack and UI fixes were
  present.

## What the merge gate actually runs

The merge gate is the **`mock-ui` Playwright project**, not the whole `tests/`
tree:

- `.github/workflows/qa.yml` → `pnpm test:e2e --project=mock-ui`
- `scripts/ci-repro.sh` (run by `.husky/pre-push` on a push to `main`) →
  `pnpm test:e2e --project=mock-ui`
- `playwright.config.ts`: the `mock-ui` project = `cesare-agentic-*.spec.ts`;
  the `chromium` project holds everything else and is **not** run by CI.

So "green the build" = a green `mock-ui` suite. Typecheck + lint + `pnpm test:unit`
were already green (1494 unit tests) and stayed green.

## Final status (objective stop criterion met)

Two consecutive **warm-server** full `mock-ui` runs (`--retries=2`, `CI=1`):

| Run    | Result                           |
| ------ | -------------------------------- |
| Warm A | **45 passed, 0 failed, 0 flaky** |
| Warm B | **45 passed, 0 failed, 0 flaky** |

(1 test is `test.skip()`-gated by its own precondition; reported by Playwright as
`1 skipped`, not a failure.)

Two earlier consecutive **Playwright-managed-server** runs (cold start, mirrors
CI exactly) also both returned `EXIT=0`:

| Run    | Result                                                           |
| ------ | ---------------------------------------------------------------- |
| Cold 1 | 45 passed, 0 failed                                              |
| Cold 2 | 44 passed, **1 flaky** (passed on retry #1), 0 failed → `EXIT=0` |

Typecheck: green. Lint (`eslint apps/web/app --max-warnings 0`): green.
Unit (`pnpm test:unit`): 1494 passed.

## New-fleet tags — all green

Verified green in `mock-ui`: `[OHW-047e]`, `[OHW-048-A3]`, `[OHW-047-A1/A2/A6/A7/A8]`,
`cesare-agentic-stream-roundtrip`, `cesare-agentic-show-changes`,
`cesare-agentic-universal-dispatch`.
Verified green in `chromium` (run in isolation, 17/17): `[OHW-049]` versions-splitdrawer
(+ `?compare`), `cesare-sessions-route` (`[OHW-047-A5]`), `pre-main-audit`.

## What was red → root cause → fix

All ten `mock-ui` failures were **stale test selectors / sequencing that lagged
the Notion v3 shell + breakdown redesigns**. The product was correct in every
case (replies landed, panels rendered, edits applied); no product code changed.

### 1. Stale `role="log"` conversation selector (6 tests)

`cesare-agentic-cost-foundation` (OHW-560/561/562) and
`cesare-agentic-budget-intelligence` (OHW-590/591/592) waited for assistant
bubbles inside `[role="log"][aria-label="Conversazione con Cesare"]` /
`getByRole("log", {name:/Cesare/})`. That ARIA wrapper now lives **only** on the
routed `SessionConversationPage`; the floating drawer renders
`<div data-testid="cesare-conversation">` (the shared `waitForCesareReply` helper
already documents this). The locator resolved to nothing → 0 bubbles → timeout.

- **Fix**: anchor both local `sendAndWaitForReply` helpers on
  `getByTestId("cesare-conversation")`.

### 2. Assistant-bubble selector missed tool-using replies (folded into #1)

`[class*="bubbleAssistant"]` only matches a plain text reply. A reply that runs a
tool renders the `assistantWithSteps` shape instead. Both shapes contain the same
markdown body (`bubbleMarkdown`); the skeleton `LoadingIndicator` does not.

- **Fix**: count assistant replies via `[class*="bubbleMarkdown"]` — covers both
  shapes, still excludes the loading skeleton.

### 3. Breakdown v3 dropped the legacy `scene-cost-panel` (OHW-542, OHW-561, OHW-543)

Spec-44 WP-C (`b694c6a`) deliberately replaced the legacy `SceneCostPanel`
(cost + a "Difficoltà" badge + category table) with the `RecapStrip`
(`data-testid="recap-strip"`: cost + category chips + CTA). The standalone
difficulty badge was intentionally removed.

- **Fix**: target `recap-strip`; keep the still-valid cost (`€`) assertion; the
  difficulty assertion tested removed UI, so it is replaced by the category-chips
  assertion (`getByLabel("Categorie")`). OHW-542 renamed to
  "RecapStrip renders the day cost and category chips". No behaviour weakened —
  the strip is the deliberately-redesigned home of the same data.

### 4. Floating Cesare drawer overlaps in-page accept widgets (OHW-570, OHW-580)

After the spec-44 shell refactor Cesare is a floating bottom-right surface
(`data-surface="floating"`). When a flow opens Cesare to send a prompt and then
clicks an **in-page** accept affordance (screenplay `proposal-accept` PM widget;
`blocking-proposal-panel` "Accetta tutto"), the open drawer geometrically
intercepts the click. The proposal applies live and the button is present and
enabled — the drawer just sits on top.

- **Fix**: added a shared `closeCesareSheet(page)` helper (clicks the drawer's
  "Chiudi" control, waits for `data-state="closed"`) and dismiss the drawer
  before clicking the in-page accept — exactly the real user flow once the reply
  has landed. No product change.

## Environmental flake (proof it is not a bug)

`[OHW-543]` failed on attempt 1 of the second cold run (12.7s) and **passed on
retry #1 (4.1s)** — it is the first agentic test in the run, so it eats the cold
vinxi-route JIT cost and a first-hit DB query. Proof it is environmental, not a
product/test bug:

- Both **warm-server** runs (A and B) executed it green with **0 flaky**.
- It passes in isolation against a warm server every time.
- `--retries=2` (CI's own setting) absorbs it; CI counts flaky-passed as green
  and both managed-server runs returned `EXIT=0`.

This is exactly the cold-start / DB-pressure flake on the `authenticatedPage`
fixture called out in the brief; mitigation is server warm-up + the existing
`--retries=2`, not a test hack.

## Out of scope for the merge gate (documented, not blocking)

The non-CI `chromium` project carries a large set of **pre-existing**, non-gated
failures (breakdown directory alone: 35 failed / 11 passed / 16 skipped). Root
cause: the breakdown **v2/v3 redesign** (`b694c6a`, `257cb91`, both ancestors of
the base) renamed/removed testids the old Spec-10/10c/10h/10i/10j tests still
target — e.g. `scene-toc-item-*` (orphaned `SceneTOC`), `readonly-screenplay-view`
(now `breakdown-screenplay`), the `SegmentedControl` → react-aria tablist for the
"Per progetto" view. These specs are not part of `qa.yml` / `ci-repro.sh` and do
not gate the merge to `main`. They are pre-existing bit-rot, not a regression from
this branch, and were left untouched here rather than partially rewritten; they
warrant a dedicated "re-point chromium breakdown specs at the v3 UI" follow-up.

## Files changed (test-only)

- `tests/helpers/cesare.ts` — new `closeCesareSheet` helper.
- `tests/cesare-agentic-cost-foundation.spec.ts`
- `tests/cesare-agentic-budget-intelligence.spec.ts`
- `tests/cesare-agentic-breakdown.spec.ts`
- `tests/cesare-agentic-screenplay.spec.ts`
- `tests/cesare-agentic-shooting-schedule.spec.ts`

No `apps/`/`packages/` source changed. No `test.skip` added to hide a failure.
