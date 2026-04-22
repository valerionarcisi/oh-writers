import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToBreakdown,
  openSceneInBreakdown,
  TEAM_PROJECT_ID,
} from "./helpers";

test.describe("[Spec 10d] Cast tier on breakdown elements", () => {
  test("[OHW-300] Aggiungi defaults to Cast and shows the Tier select", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await openSceneInBreakdown(page, 1);

    await page.getByTestId("add-element-trigger").click();

    const categorySelect = page.getByTestId("add-element-category");
    await expect(categorySelect).toHaveValue("cast");

    const tierSelect = page.getByTestId("add-element-cast-tier");
    await expect(tierSelect).toBeVisible();
    await expect(tierSelect).toHaveValue("principal");
  });

  test("[OHW-301] Tier select hides when category is not Cast", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await openSceneInBreakdown(page, 1);

    await page.getByTestId("add-element-trigger").click();
    await page.getByTestId("add-element-category").selectOption("props");
    await expect(page.getByTestId("add-element-cast-tier")).toHaveCount(0);
  });

  test("[OHW-302] Add a Day Player → Cast section sub-groups by tier", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await openSceneInBreakdown(page, 1);

    await page.getByTestId("add-element-trigger").click();
    await page.getByTestId("add-element-name").fill("Roberto");
    // category already defaults to cast; switch tier to day_player
    await page.getByTestId("add-element-cast-tier").selectOption("day_player");
    await page.getByTestId("add-element-submit").click();

    // The Cast section now shows the "Giornaliero" sub-header with Roberto.
    const dayPlayerLabel = page.getByTestId("cast-tier-label-day_player");
    await expect(dayPlayerLabel).toBeVisible();
    await expect(dayPlayerLabel).toHaveText("Giornaliero");

    await expect(
      page.getByTestId("accepted-tag-Roberto").first(),
    ).toBeVisible();
  });
});
