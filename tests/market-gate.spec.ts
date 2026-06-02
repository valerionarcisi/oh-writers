import { test, expect, BASE_URL, TEST_TEAM_PROJECT_ID } from "./fixtures";
import type { Page } from "@playwright/test";

// [OHW-market-gate] Feature flags (Spec 54) — Italy-only features are detached
// on the international (EN) market. The fundraising/Opportunità route is the
// strongest, race-free signal: a server-side beforeLoad redirect in EN, the
// page in IT. The default `test` fixture user is IT; we flip its locale via the
// MOCK_AI-gated test endpoint and reset to IT afterwards.

const PROJECT = TEST_TEAM_PROJECT_ID;
const OPP_URL = `${BASE_URL}/projects/${PROJECT}/opportunities`;

const setLocale = async (page: Page, locale: "it" | "en"): Promise<void> => {
  const res = await page.request.post(`${BASE_URL}/api/test/set-locale`, {
    data: { locale },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.ok(), `set-locale ${locale}`).toBe(true);
};

test.describe("[OHW-market-gate] Italy-only features", () => {
  test.afterEach(async ({ authenticatedPage }) => {
    // Restore the shared fixture user to Italian so other suites are unaffected.
    await setLocale(authenticatedPage, "it");
  });

  test("IT market reaches the fundraising route", async ({
    authenticatedPage: page,
  }) => {
    await setLocale(page, "it");
    await page.goto(OPP_URL);
    await expect(page).toHaveURL(/\/opportunities$/);
  });

  test("EN market redirects the fundraising route away (Italy-only)", async ({
    authenticatedPage: page,
  }) => {
    await setLocale(page, "en");
    await page.goto(OPP_URL);
    // The beforeLoad guard redirects to the project home before render.
    await expect(page).not.toHaveURL(/\/opportunities$/);
  });
});
