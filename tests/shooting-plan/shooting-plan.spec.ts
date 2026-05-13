import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

// Prerequisite: the test project must have a generated schedule with at least
// one shoot day. If the schedule hasn't been generated yet, tests that need
// day data will skip gracefully.

test.describe("[OHW-022] Piano di Ripresa — shot planning", () => {
  test("[OHW-022] Navigate to Piano di Ripresa → h1 and day sidebar render", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    // Heading is always present once ShootingPlanPage renders with a schedule
    const heading = page.getByRole("heading", {
      level: 1,
      name: "Piano di Ripresa",
    });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // At least one day button with text "GG 1" must appear in the sidebar
    const firstDayBtn = page.getByText("GG 1");
    await expect(firstDayBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-022] Select a day → scene balance bars appear in the main area", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    // Wait for the page to load
    const firstDayBtn = page.getByText("GG 1");
    await expect(firstDayBtn.first()).toBeVisible({ timeout: 15_000 });

    // Click the first day button (it may already be auto-selected, but click anyway)
    await firstDayBtn.first().click();

    // The day balance timeline shows scene rows (buttons with "SC." prefix)
    const sceneRows = page.locator('[class*="sceneRow"]');
    const count = await sceneRows.count();
    if (count === 0) {
      // If day has no strips, the timeline will be empty — skip gracefully
      test.skip();
      return;
    }
    await expect(sceneRows.first()).toBeVisible({ timeout: 8_000 });
  });

  test("[OHW-022] Create shot plan → 'Inizia piano di ripresa' → Piano A tab appears → add shot → shot block appears", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const firstDayBtn = page.getByText("GG 1");
    await expect(firstDayBtn.first()).toBeVisible({ timeout: 15_000 });
    await firstDayBtn.first().click();

    // Click the first scene bar to open the SceneShotTimeline
    const sceneRows = page.locator('[class*="sceneRow"]');
    const rowCount = await sceneRows.count();
    if (rowCount === 0) {
      test.skip();
      return;
    }
    await sceneRows.first().click();

    // Expect the "Inizia piano di ripresa" button (no plan yet) or scenario tabs (plan exists)
    const startBtn = page.getByRole("button", {
      name: "Inizia piano di ripresa",
    });
    const pianoATab = page.getByRole("button", { name: /Piano A/ });

    // If a plan already exists for this scene, skip the creation step
    const hasPlan = await pianoATab
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (!hasPlan) {
      await expect(startBtn).toBeVisible({ timeout: 10_000 });
      await startBtn.click();
      await expect(pianoATab).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(pianoATab).toBeVisible({ timeout: 5_000 });
    }

    // Add a shot by clicking the "+" button in the track area
    const addShotBtn = page.getByRole("button", { name: "+" });
    await expect(addShotBtn).toBeVisible({ timeout: 8_000 });
    await addShotBtn.click();

    // A shot block should appear — it renders with class "block" and contains the shot size label "MS"
    const shotBlock = page
      .locator('[class*="block"]')
      .filter({ hasText: "MS" });
    await expect(shotBlock.first()).toBeVisible({ timeout: 8_000 });
  });

  test("[OHW-022] Edit shot → change size in detail panel → updated label appears in timeline", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const firstDayBtn = page.getByText("GG 1");
    await expect(firstDayBtn.first()).toBeVisible({ timeout: 15_000 });
    await firstDayBtn.first().click();

    const sceneRows = page.locator('[class*="sceneRow"]');
    if ((await sceneRows.count()) === 0) {
      test.skip();
      return;
    }
    await sceneRows.first().click();

    // Ensure a plan exists (create if needed)
    const pianoATab = page.getByRole("button", { name: /Piano A/ });
    const startBtn = page.getByRole("button", {
      name: "Inizia piano di ripresa",
    });
    const hasPlan = await pianoATab
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    if (!hasPlan) {
      await expect(startBtn).toBeVisible({ timeout: 10_000 });
      await startBtn.click();
      await expect(pianoATab).toBeVisible({ timeout: 10_000 });
    }

    // Ensure at least one shot exists
    const addShotBtn = page.getByRole("button", { name: "+" });
    await expect(addShotBtn).toBeVisible({ timeout: 8_000 });

    let shotBlock = page.locator('[class*="block"]').filter({ hasText: "MS" });
    const hasShot = await shotBlock
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    if (!hasShot) {
      await addShotBtn.click();
      await expect(shotBlock.first()).toBeVisible({ timeout: 8_000 });
    }

    // Click the shot to open the detail panel
    await shotBlock.first().click();

    // The detail panel's "Dimensione" select should appear
    const sizeSelect = page.getByLabel("Dimensione");
    await expect(sizeSelect).toBeVisible({ timeout: 8_000 });

    // Change to CU
    await sizeSelect.selectOption("CU");

    // The shot block label in the timeline should update to "CU"
    const cuBlock = page.locator('[class*="block"]').filter({ hasText: "CU" });
    await expect(cuBlock.first()).toBeVisible({ timeout: 8_000 });
  });

  test("[OHW-022] Plan B scenario → click '+ scenario' → second tab appears and becomes active on click", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const firstDayBtn = page.getByText("GG 1");
    await expect(firstDayBtn.first()).toBeVisible({ timeout: 15_000 });
    await firstDayBtn.first().click();

    const sceneRows = page.locator('[class*="sceneRow"]');
    if ((await sceneRows.count()) === 0) {
      test.skip();
      return;
    }
    await sceneRows.first().click();

    // Ensure a plan exists
    const pianoATab = page.getByRole("button", { name: /Piano A/ });
    const startBtn = page.getByRole("button", {
      name: "Inizia piano di ripresa",
    });
    const hasPlan = await pianoATab
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    if (!hasPlan) {
      await expect(startBtn).toBeVisible({ timeout: 10_000 });
      await startBtn.click();
      await expect(pianoATab).toBeVisible({ timeout: 10_000 });
    }

    // Click "+ scenario" to add a second scenario
    const addScenarioBtn = page.getByRole("button", { name: "+ scenario" });
    await expect(addScenarioBtn).toBeVisible({ timeout: 8_000 });
    await addScenarioBtn.click();

    // A "Piano B" tab should appear
    const pianoBTab = page.getByRole("button", { name: /Piano B/ });
    await expect(pianoBTab).toBeVisible({ timeout: 10_000 });

    // Click Piano B — it should become active (data-active attribute set)
    await pianoBTab.click();
    await expect(pianoBTab).toHaveAttribute("data-active", "", {
      timeout: 5_000,
    });
  });
});
