import type { Page } from "@playwright/test";
import { test, expect, BASE_URL, TEST_TEAM_PROJECT_ID } from "./fixtures";
import {
  closeCesareSheet,
  openCesareSheet,
  resetCesareState,
  sendCesareWithRetry,
} from "./helpers/cesare";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

const openVersions = async (page: Page): Promise<void> => {
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("topbar-version-chip").click();
  await expect(page.getByTestId("versions-split-drawer")).toBeVisible({
    timeout: 15_000,
  });
};

const cesareVersionRows = (page: Page) =>
  page
    .locator('[data-testid^="versions-split-row-"]')
    .filter({ hasText: "Cesare ·" });

test.describe("[OHW-075] Cesare versioning policy", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEST_TEAM_PROJECT_ID);
  });

  test("same-session edits collapse; an explicit request creates one new version", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("rich-text-editor")).toBeVisible({
      timeout: 15_000,
    });

    await openCesareSheet(page);
    await sendCesareWithRetry(page, "Rendi il soggetto più asciutto.");
    await sendCesareWithRetry(page, "Riscrivi il soggetto più tematico.");
    await closeCesareSheet(page);

    await openVersions(page);
    const versionRows = page.locator('[data-testid^="versions-split-row-"]');
    await expect(versionRows).toHaveCount(2);
    await expect(cesareVersionRows(page)).toHaveCount(1);
    await expect(page.getByText(/Cesare · modifica \d+/)).toHaveCount(0);

    await page.goto(SOGGETTO_PATH);
    await openCesareSheet(page);
    await sendCesareWithRetry(
      page,
      "Fanne una nuova versione del soggetto, più cupa.",
    );
    await closeCesareSheet(page);

    await openVersions(page);
    await expect(versionRows).toHaveCount(3);
    await expect(cesareVersionRows(page)).toHaveCount(1);
    await expect(page.getByText(/v2 più cupa \(v3\)/)).toBeVisible();
    await expect(page.getByText(/Cesare · modifica \d+/)).toHaveCount(0);

    const workingRow = cesareVersionRows(page).first();
    const workingRowId = (
      await workingRow.getAttribute("data-testid")
    )?.replace("versions-split-row-", "");
    expect(workingRowId).toBeTruthy();
    await page.getByTestId(`version-activate-${workingRowId}`).click();

    await page.goto(SOGGETTO_PATH);
    await openCesareSheet(page);
    await sendCesareWithRetry(page, "Rendi il soggetto più essenziale.");
    await closeCesareSheet(page);

    await openVersions(page);
    await expect(versionRows).toHaveCount(4);
    await expect(cesareVersionRows(page)).toHaveCount(2);
    await page.screenshot({
      path: "test-results/cesare-versioning-policy.png",
      fullPage: true,
    });
  });
});
