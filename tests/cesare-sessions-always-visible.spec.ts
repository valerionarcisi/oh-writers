import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { openCesareSheet } from "./helpers/cesare";

/**
 * [Spec 44 F1] The "Sessioni Cesare" section in the LeftRail must be visible
 * at all times — independent of whether the Cesare drawer is open or closed.
 * The legacy build gated it on `body[data-cesare]` so it vanished when Cesare
 * was closed.
 */
test.describe("[Spec 44 F1] Sessioni Cesare always visible in LeftRail", () => {
  test("[OHW-044-F1] sessions section is visible with Cesare CLOSED", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    // Cesare starts closed (default). The body flag must NOT be expanded/full.
    const cesareState = await authenticatedPage.evaluate(
      () => document.body.dataset["cesare"] ?? "closed",
    );
    expect(["closed", undefined, ""]).toContain(cesareState);

    const sessionsSection = authenticatedPage.locator(
      '[data-rail-section="sessions"]',
    );
    await expect(sessionsSection).toBeVisible({ timeout: 10_000 });
    await expect(
      authenticatedPage.getByTestId("rail-sessions-title").first(),
    ).toBeVisible();
  });

  test("[OHW-044-F1] sessions section stays visible after opening AND closing Cesare", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    const sessionsSection = authenticatedPage.locator(
      '[data-rail-section="sessions"]',
    );
    await expect(sessionsSection).toBeVisible({ timeout: 10_000 });

    await openCesareSheet(authenticatedPage);
    await expect(sessionsSection).toBeVisible();

    // Close Cesare via the dock pill toggle and re-assert.
    await authenticatedPage
      .getByRole("button", { name: /^Cesare(\s—.*)?$/ })
      .click();
    await expect(sessionsSection).toBeVisible({ timeout: 5_000 });
  });
});
