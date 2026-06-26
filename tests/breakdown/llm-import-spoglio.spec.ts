import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

/**
 * [Spec 10g] LLM-at-import full breakdown
 *
 * Sonnet 4 runs once per version at first mount, streams scene-by-scene
 * tool_use deltas and persists them as accepted (>=0.8 confidence) or
 * pending (0.5–0.79). The polling progress endpoint feeds the
 * StreamingProgressBanner; cache short-circuit on subsequent visits.
 *
 * The browser slice below verifies the wired UX surfaces — the re-spoglio
 * affordance and banner testid wiring. The full round-trip tests
 * (330..335) require the dev server to be launched with MOCK_AI=true and
 * LLM_FIRST_BREAKDOWN=true; Playwright cannot toggle either after start. Until
 * a dedicated test-server config lands, the deterministic round-trip is covered
 * by the unit tests on
 *   - apps/web/app/features/breakdown/lib/parse-scene-stream.test.ts
 *   - apps/web/app/features/breakdown/lib/llm-spoglio-prompt.test.ts
 *   - packages/ui/src/components/progress-math.test.ts
 *
 * v3 note: the old `ai-respoglio-trigger` dropdown (trigger + menu + full
 * option) was replaced by a single FloatingDock primary action labelled
 * "Ri-spogliare con AI" — there is no menu anymore, and the dock is no longer
 * gated on canEdit, so the per-tier dropdown + viewer-hidden assertions below
 * are skipped rather than re-pointed at a contract that no longer exists.
 */
test.describe("[Spec 10g] Breakdown — LLM-at-import", () => {
  test("[330-ui] editor sees the 'Ri-spogliare con AI' action", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    // The re-spoglio entry point is the TopBar primary CTA beside the ⋯ menu
    // (BUG-N68 follow-up: moved off the bottom-left FloatingDock).
    const trigger = page.getByTestId("breakdown-respoglio-cta");
    await expect(trigger).toBeVisible();
    await expect(trigger).toBeEnabled();
  });

  // SKIPPED (removed UI, not a testid rename): v3 replaced the `ai-respoglio`
  // dropdown (trigger → `ai-respoglio-menu` → `ai-respoglio-full`) with a single
  // primary action. There is no menu to open, so this scenario no longer exists.
  test.skip("[330-ui-menu] dropdown opens and exposes the full re-run option", () => {});

  // The re-spoglio CTA mutates the breakdown, so it is gated on canEdit — a
  // viewer never sees it (BUG-N68 follow-up restored this contract when the CTA
  // moved from the always-on FloatingDock to a TopBar button). Server-side
  // enforcement still applies on top.
  test("[330-permissions] viewer never sees the re-spoglio CTA", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("breakdown-respoglio-cta")).toHaveCount(0);
  });

  test("[330-banner] LLM banner stays hidden when the feature flag is off", async ({
    authenticatedPage,
  }) => {
    // Default test env: LLM_FIRST_BREAKDOWN unset, MOCK_AI=false. The
    // server fn early-returns, scenesTotal stays null, the banner must
    // not render.
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("llm-spoglio-banner")).toHaveCount(0);
  });

  test.skip("[330] import .fountain → banner visible → BreakdownPanel populates → completion toast", () => {
    // Pending: requires the dev server to be launched with MOCK_AI=true
    // (Playwright cannot toggle env after start) plus a fresh import flow
    // that resets breakdown_version_state. The deterministic per-scene
    // streaming is covered by the unit tests on extractCompleteScenes
    // and the persistence path is exercised by the server fn directly.
  });

  test.skip("[331] cache hit on re-open: second mount short-circuits via lastFullSpoglioRunAt", () => {
    // Pending: same MOCK_AI=true requirement as 330. The cache
    // short-circuit is unit-tested via the streamFullSpoglio handler's
    // cachedState branch; the browser path needs a long-running fixture
    // we don't yet seed.
  });

  test.skip("[332] per-scene edit triggers Haiku incremental re-spoglio", () => {
    // Pending: the Haiku per-scene incremental path is the next slice of
    // Spec 10g (10g.2). Currently only the Sonnet full-version run is
    // wired. Tracked separately.
  });

  test.skip("[333] manual full re-run preserves accepted/ignored states", () => {
    // Pending: requires MOCK_AI=true plus a seed with at least one
    // accepted and one ignored occurrence on the team version. The
    // persistence path uses onConflictDoNothing on the (element,
    // version, scene) key, so existing terminal statuses survive — but
    // an end-to-end browser assertion still needs the fixture above.
  });

  test.skip("[334] Anthropic 5xx → regex fallback remains visible, no orphan banner", () => {
    // Pending: requires Playwright to intercept the Anthropic API call
    // and force a 503 response. The streamFullSpoglio handler wraps the
    // SDK call in try/catch and returns LlmSpoglioFailedError; the
    // regex baseline (Spec 10e) runs in parallel so the user still sees
    // tags. Browser assertion blocked on a route-mock harness.
  });

  test.skip("[335] MOCK_AI=true deterministic 47-scene assertion", () => {
    // Pending: same MOCK_AI=true requirement as 330. The per-scene
    // CAPS heuristic is exhaustively unit-tested at
    // apps/web/app/mocks/ai-responses.test.ts; the browser slice would
    // re-verify the same code path with significant overhead.
  });
});
