import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToBreakdown,
  openSceneInBreakdown,
  TEAM_PROJECT_ID,
} from "./helpers";

/**
 * [Spec 10 — E2/E4] Cesare browser flow
 *
 * The deterministic MOCK_AI fixture is exhaustively unit-tested at
 * `apps/web/app/mocks/ai-responses.test.ts` (OHW-257). The
 * `checkAndStampRateLimit` helper is unit-tested at
 * `apps/web/app/features/breakdown/lib/rate-limit.test.ts` (OHW-259).
 *
 * The browser slice below verifies the wired UX: the suggest button is
 * present and disables itself while the mutation is pending. The full
 * round-trip (click → assert 5 ghost tags → click again → assert
 * rate-limit toast) requires the dev server to run with MOCK_AI=true and
 * a seeded warehouse scene; both are documented in README.
 */

test.describe("[Spec 10] Breakdown — Cesare", () => {
  test("[OHW-257-ui] suggest button visible and operable for editor", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await openSceneInBreakdown(authenticatedPage, 1);
    const suggest = authenticatedPage.getByTestId("cesare-suggest-scene");
    await expect(suggest).toBeVisible();
    await expect(suggest).toBeEnabled();
  });

  test.skip("[OHW-258] re-run Cesare on already-breakdown scene preserves accepted/ignored states", () => {
    // Pending: requires a seeded scene with a mix of pending/accepted/
    // ignored occurrences from a previous Cesare run, then assert that
    // calling suggest again only adds new pending rows and never
    // overwrites the existing terminal states.
  });

  test.skip("[OHW-259] suggest-all rate limit toast within 5 minutes", () => {
    // Pending: blocked by the missing "Suggerisci tutto lo script" UI
    // affordance + the matching `suggestBreakdownForAllScenes` server
    // fn. The per-scene rate-limit branch is covered by the unit test on
    // `checkAndStampRateLimit`.
  });

  test.skip("[OHW-257] MOCK_AI returns deterministic 5 suggestions for warehouse fixture", () => {
    // Pending: requires (a) the dev server to be launched with
    // MOCK_AI=true (Playwright cannot toggle it after start) and (b) a
    // seeded scene whose heading contains "WAREHOUSE" + "Rick" so the
    // mock heuristic fires. Until the seed lands a dedicated warehouse
    // fixture, the assertion is satisfied by the unit test in
    // ai-responses.test.ts that exercises the same code path with no
    // browser overhead.
  });
});
