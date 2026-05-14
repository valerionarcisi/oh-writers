import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

test.describe("[OHW-022c] 2D Scene Blocking Render", () => {
  test("[OHW-022c-01] Blocking card renders instead of placeholder on scene select", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await expect(scenes.first()).toBeVisible({ timeout: 15_000 });
    await scenes.first().click();

    await expect(
      page.getByText("Blocking 2D — disponibile in versione futura"),
    ).not.toBeVisible({ timeout: 5_000 });

    await expect(page.getByText(/ANTEPRIMA BLOCKING/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("[OHW-022c-02] Cesare precompilato shows SUGGERITO badge on first open", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    const unplanned = scenes.filter({ hasText: "non pianificata" }).first();
    const found = await unplanned.count();
    if (found === 0) {
      test.skip();
      return;
    }
    await unplanned.click();

    await expect(page.getByText("SUGGERITO")).toBeVisible({ timeout: 20_000 });
  });

  test("[OHW-022c-03] Blocking card has ⌘B editor button", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    await expect(
      page.getByRole("button", { name: /⌘B Editor/ }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("[OHW-022c-04] Opening blocking editor via button navigates to /blocking-editor", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    const editorBtn = page.getByRole("button", { name: /⌘B Editor/ });
    await expect(editorBtn).toBeVisible({ timeout: 15_000 });
    await editorBtn.click();

    await expect(page).toHaveURL(/blocking-editor/, { timeout: 10_000 });
    await expect(
      page.getByRole("toolbar", { name: "Blocking editor tools" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-022c-05] Blocking editor close button returns to shooting plan", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    const editorBtn = page.getByRole("button", { name: /⌘B Editor/ });
    await expect(editorBtn).toBeVisible({ timeout: 15_000 });
    await editorBtn.click();

    await expect(page).toHaveURL(/blocking-editor/, { timeout: 10_000 });

    await page.getByRole("button", { name: "← Chiudi" }).click();
    await expect(page).not.toHaveURL(/blocking-editor/, { timeout: 10_000 });
  });

  test("[OHW-022c-06] Vista 3D button is disabled", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    const vista3dBtn = page.getByRole("button", { name: /Vista 3D/ });
    await expect(vista3dBtn).toBeVisible({ timeout: 15_000 });
    await expect(vista3dBtn).toBeDisabled();
  });

  test("[OHW-022c-07] Legend shows CAMERA, PERSONAGGIO, ARREDO labels", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    await expect(page.getByText("■ CAMERA")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("● PERSONAGGIO")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("□ ARREDO")).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-022c-08] Blocking editor draw tool buttons are visible", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.locator('[class*="sceneItem"]');
    await scenes.first().click();

    const editorBtn = page.getByRole("button", { name: /⌘B Editor/ });
    await expect(editorBtn).toBeVisible({ timeout: 15_000 });
    await editorBtn.click();

    await expect(page).toHaveURL(/blocking-editor/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Seleziona/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: /Parete/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: /Mobile/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: /Apertura/ })).toBeVisible({
      timeout: 5_000,
    });
  });
});
