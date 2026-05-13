import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

test.describe("[OHW-022] Piano di Ripresa — shot planning (decoupled)", () => {
  test("[OHW-022] Page renders without a schedule → h1 + scene sidebar", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const heading = page.getByRole("heading", {
      level: 1,
      name: "Piano di Ripresa",
    });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("Scene del progetto")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[OHW-022] Sidebar lists scenes with planned/unplanned status", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    await expect(page.getByText("Scene del progetto")).toBeVisible({
      timeout: 15_000,
    });

    const sceneButtons = page.locator('[class*="sceneItem"]');
    const count = await sceneButtons.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await expect(sceneButtons.first()).toBeVisible();

    const statusBadge = sceneButtons.first().locator('[class*="sceneStatus"]');
    await expect(statusBadge).toContainText(/non pianificata|shot/);
  });

  test("[OHW-022] Select a scene → SceneShotTimeline renders with Piano A tab", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await expect(sceneButtons.first()).toBeVisible({ timeout: 15_000 });

    await sceneButtons.first().click();

    await expect(page.getByText(/Piano A|Inizia piano di ripresa/)).toBeVisible(
      { timeout: 10_000 },
    );
  });

  test("[OHW-022] Add a shot to an unplanned scene → sidebar status updates", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page.locator('[class*="sceneItem"]');
    await expect(sceneButtons.first()).toBeVisible({ timeout: 15_000 });

    const unplanned = sceneButtons
      .filter({ hasText: "non pianificata" })
      .first();
    const found = await unplanned.count();
    if (found === 0) {
      test.skip();
      return;
    }
    await unplanned.click();

    const startBtn = page.getByRole("button", {
      name: /Inizia piano di ripresa/,
    });
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    const addShotBtn = page.getByRole("button", {
      name: /\+ shot|Aggiungi shot/,
    });
    await expect(addShotBtn).toBeVisible({ timeout: 10_000 });
    await addShotBtn.click();

    await expect(unplanned.locator('[class*="sceneStatus"]')).toContainText(
      /1 shot/,
      { timeout: 10_000 },
    );
  });
});
