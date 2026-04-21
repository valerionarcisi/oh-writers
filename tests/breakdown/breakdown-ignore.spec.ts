import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToBreakdown,
  openSceneInBreakdown,
  TEAM_PROJECT_ID,
} from "./helpers";

/**
 * [Spec 10 — OHW-243] "Ignora tutti" must dismiss all ghost suggestions
 * without persisting them as confirmed elements. Regression guard for a
 * bug where ignored occurrences rendered as normal tags in both the
 * "Per scena" list and the "Per progetto" table.
 *
 * Requires the dev server to run with MOCK_AI=true.
 */

test.describe("[Spec 10] Breakdown — Ignora tutti", () => {
  test("removes ghost suggestions and does not leak them into the project table", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await openSceneInBreakdown(page, 1);

    await page.getByTestId("cesare-suggest-scene").click();
    const banner = page.getByTestId("cesare-suggestion-banner");
    await expect(banner).toBeVisible();

    const ghostTags = page.locator('[data-testid^="ghost-tag-"]');
    await expect(ghostTags.first()).toBeVisible();
    const suggestedNames = await ghostTags.evaluateAll((els) =>
      els
        .map((el) => el.getAttribute("data-testid"))
        .filter((v): v is string => !!v)
        .map((v) => v.replace(/^ghost-tag-/, "")),
    );
    expect(suggestedNames.length).toBeGreaterThan(0);

    await banner.getByRole("button", { name: "Ignora tutti" }).click();

    await expect(banner).toBeHidden();
    await expect(page.locator('[data-testid^="ghost-tag-"]')).toHaveCount(0);
    for (const name of suggestedNames) {
      await expect(page.getByTestId(`accepted-tag-${name}`)).toHaveCount(0);
    }

    await page.getByRole("tab", { name: "Per progetto" }).click();
    const table = page.getByTestId("project-breakdown-table");
    await expect(table).toBeVisible();
    for (const name of suggestedNames) {
      await expect(table.getByText(name, { exact: true })).toHaveCount(0);
    }
  });
});
