import { test, expect, BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

// [i18n-switch] The settings language selector flips the UI locale, which
// is resolved server-side — so after the switch `<html lang>` and the nav
// labels re-render from the new value (router.invalidate re-runs the loaders).

const htmlLang = (page: Page): Promise<string | null> =>
  page.locator("html").getAttribute("lang");

test.describe("[i18n-switch] settings language selector", () => {
  test.afterEach(async ({ authenticatedPage }) => {
    // Reset the shared fixture user to Italian for other suites.
    await authenticatedPage.request.post(`${BASE_URL}/api/test/set-locale`, {
      data: { locale: "it" },
      headers: { "Content-Type": "application/json" },
    });
  });

  test("switching to English updates html lang + persists", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.getByTestId("language-section")).toBeVisible({
      timeout: 20_000,
    });
    // On a cold dev-server route the client bundle JIT-compiles after first
    // paint; clicking before hydration is a no-op. Wait for network to settle so
    // the SegmentedControl's onClick is wired.
    await page.waitForLoadState("networkidle");
    // Starts Italian (seeded fixture user).
    expect(await htmlLang(page)).toBe("it");

    // Clicking triggers the locale mutation + a full reload (server re-resolves
    // the locale into <html lang>). The reload makes <html lang> become "en".
    await page.getByTestId("segmented-en").click();
    await expect.poll(() => htmlLang(page), { timeout: 15_000 }).toBe("en");

    // Persisted: a fresh navigation still renders English.
    await page.goto(`${BASE_URL}/settings`);
    expect(await htmlLang(page)).toBe("en");
  });
});
