// Spec 82 — editorial-advice "Segna" decisions persist to the DB, keyed to
// project+doc+area+text-anchor, not to localStorage. Marking a note as
// "Scelta autoriale" must survive a full page reload AND a brand new browser
// context (proving it is not localStorage — Playwright gives each
// `authenticatedPage` its own fresh context/storage) (OHW-414).
import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "./fixtures";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;
const TARGET_TITLE = "Snodo centrale da rendere più leggibile";

test.describe
  .serial("[082] Editorial advice decisions persist across reload", () => {
  test("marking a note as scelta autoriale hides it and survives a reload", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const column = page.getByTestId("margin-notes-column");
    await expect(column).toBeVisible({ timeout: 15_000 });

    const card = column.locator("article", { hasText: TARGET_TITLE }).first();
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Apri azioni editoriali" }).click();
    await page.getByRole("menuitem", { name: "Scelta autoriale" }).click();

    await expect(
      column.locator("article", { hasText: TARGET_TITLE }),
    ).toHaveCount(0);

    await page.reload();
    await expect(column).toBeVisible({ timeout: 15_000 });
    await expect(
      column.locator("article", { hasText: TARGET_TITLE }),
    ).toHaveCount(0);
  });

  // `authenticatedPage` opens a BRAND NEW browser context per test (own
  // storage/cookies) — a decision that only survived in localStorage would
  // reset here. Runs after the test above (test.describe.serial) so the
  // decision this test expects to see was already recorded server-side.
  test("a brand new browser context still sees the decision (proves DB, not localStorage)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const column = page.getByTestId("margin-notes-column");
    await expect(column).toBeVisible({ timeout: 15_000 });

    await expect(
      column.locator("article", { hasText: TARGET_TITLE }),
    ).toHaveCount(0);
  });
});
