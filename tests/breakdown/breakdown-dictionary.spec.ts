import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { BASE_URL } from "../helpers";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

test.describe("[Spec 10i] Breakdown dictionary pass", () => {
  test("[OHW-10i-1] IT dictionary pass surfaces artifact ghost for scene 1 props", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Auto-spoglio runs on mount and calls extractElements with locale=it.
    // Scene 1 notes contain "tavolo" which is in the MultiWordNet IT artifact
    // whitelist. The ghost-decoration plugin then finds "tavolo" in the fountain
    // text and renders data-ghost="true" spans.
    await expect(
      page
        .locator('[data-ghost="true"]')
        .filter({ hasText: /tavolo/i })
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("[OHW-10i-2] project settings shows locale select defaulting to italiano", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/settings`);

    const select = page.getByTestId("locale-select");
    await expect(select).toBeVisible({ timeout: 10_000 });
    await expect(select).toHaveValue("it");
  });

  test("[OHW-10i-3] changing locale to english saves and persists", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/settings`);

    const select = page.getByTestId("locale-select");
    await expect(select).toBeVisible({ timeout: 10_000 });

    await select.selectOption("en");

    // The select is disabled while the mutation is in-flight; wait for it to re-enable.
    await expect(select).toBeEnabled({ timeout: 5_000 });
    await expect(select).toHaveValue("en");

    // Reload to confirm server-side persistence.
    await page.reload();
    await expect(page.getByTestId("locale-select")).toHaveValue("en", {
      timeout: 10_000,
    });

    // Restore to 'it' so subsequent tests that depend on the IT dictionary pass
    // (e.g. re-runs of OHW-10i-1) are not affected.
    await page.getByTestId("locale-select").selectOption("it");
    await expect(page.getByTestId("locale-select")).toBeEnabled({
      timeout: 5_000,
    });
  });
});
