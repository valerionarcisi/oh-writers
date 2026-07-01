import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  resetScreenplayState,
  sendCesareWithRetry,
} from "./helpers/cesare";

/**
 * [#50] Screenplay regeneration must show ONE draft-promote banner, not a pile.
 *
 * The model re-proposes a revision several times in one turn; each push used to
 * stack a separate "Promuovi / Scarta" banner (and leave an orphan draft version
 * row). The supersede logic collapses them to a single live banner.
 *
 * The mock fires propose_screenplay_revision three times in one turn for
 * "rigenera tre volte"; after the turn exactly one cesare-draft-banner is shown.
 */
test.describe("[#50] Cesare Agentic — Screenplay one banner per regeneration", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetScreenplayState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("three revision calls in one turn collapse to a single draft banner", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await expect(authenticatedPage.getByTestId("prosemirror-view")).toBeVisible(
      { timeout: 20_000 },
    );

    await openCesareSheet(authenticatedPage);
    await sendCesareWithRetry(authenticatedPage, "Rigenera tre volte.");

    const banner = authenticatedPage.getByTestId("cesare-draft-banner");
    await expect(banner.first()).toBeVisible({ timeout: 10_000 });

    // Exactly ONE banner — the supersede collapsed the three revision pushes.
    await expect.poll(async () => banner.count(), { timeout: 5_000 }).toBe(1);
  });
});
