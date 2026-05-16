import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

test.describe("[OHW-022b] Piano di Ripresa v2 — parallel plans", () => {
  test("[OHW-022b] Auto-populate creates Piano A with shots on first scene open", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await expect(sceneButtons.first()).toBeVisible({ timeout: 15_000 });

    const unplanned = sceneButtons.filter({ hasText: "non pianificata" }).first();
    const found = await unplanned.count();
    if (found === 0) {
      test.skip();
      return;
    }
    await unplanned.click();

    await expect(page.getByText("Piano A")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\d+ shot/)).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText(/suggerito/)).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-022b] Quick-add toolbar adds shot to active plan", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await sceneButtons.first().click();

    const cuBtn = page.getByRole("button", { name: "CU", exact: true });
    await expect(cuBtn).toBeVisible({ timeout: 10_000 });
    const initialShotCount = await page
      .locator('[class*="ShotBlock_block"], [class*="block"][data-shot-id]')
      .count();
    await cuBtn.click();

    await page.waitForTimeout(500);
    const newCount = await page
      .locator('[class*="ShotBlock_block"], [class*="block"][data-shot-id]')
      .count();
    expect(newCount).toBeGreaterThan(initialShotCount);
  });

  test("[OHW-022b] Pattern menu shows recommended badge", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await sceneButtons.first().click();

    const patternBtn = page.getByRole("button", { name: /Pattern/ });
    await expect(patternBtn).toBeVisible({ timeout: 10_000 });
    await patternBtn.click();

    await expect(page.getByText("consigliato").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("[OHW-022b] Script panel toggles open and persists", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await sceneButtons.first().click();

    const scriptTab = page.getByRole("button", {
      name: /Apri pannello sceneggiatura/,
    });
    await expect(scriptTab).toBeVisible({ timeout: 10_000 });
    await scriptTab.click();

    await expect(page.getByText(/Scena \d+ — testo/)).toBeVisible({
      timeout: 5_000,
    });

    await page.reload();
    await sceneButtons.first().click();
    await expect(page.getByText(/Scena \d+ — testo/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[OHW-022b] PlanPicker creates a second plan", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await sceneButtons.first().click();

    await expect(page.getByText("Piano A")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "+ piano" }).click();
    await page.getByRole("button", { name: "Vuoto", exact: true }).click();

    await expect(page.getByText("Piano B")).toBeVisible({ timeout: 10_000 });
  });
});
