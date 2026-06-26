import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { openCesareSheet } from "./helpers/cesare";

/**
 * [Spec 44] The Cesare context chip + prompt suggestions must track the active
 * route/view. The legacy build left the chip stale ("SCENEGGIATURA") across
 * navigation, especially when the URL used a localized (Italian) slug that
 * didn't match the English route segment and fell back to the default page.
 */
test.describe("[Spec 44] Cesare context chip reacts to the active route", () => {
  test("[044-CTX] chip updates when navigating soggetto → synopsis", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    const chip = authenticatedPage.getByTestId("cesare-context-chip").first();
    await expect(chip).toHaveText(/SOGGETTO/, { timeout: 10_000 });

    // Navigate to the synopsis view. The chip must follow the route.
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/synopsis`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesareSheet(authenticatedPage);
    await expect(
      authenticatedPage.getByTestId("cesare-context-chip").first(),
    ).toHaveText(/SINOSSI/, { timeout: 10_000 });
  });

  test("[044-CTX] chip updates when navigating soggetto → locations", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesareSheet(authenticatedPage);
    await expect(
      authenticatedPage.getByTestId("cesare-context-chip").first(),
    ).toHaveText(/SOGGETTO/, { timeout: 10_000 });

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/locations`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesareSheet(authenticatedPage);
    await expect(
      authenticatedPage.getByTestId("cesare-context-chip").first(),
    ).toHaveText(/LOCATION/, { timeout: 10_000 });
  });
});
