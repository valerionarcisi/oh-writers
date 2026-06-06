import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

test.describe("[OHW-022b] Piano di Ripresa v2 — parallel plans", () => {
  test("[OHW-022b] Auto-populate creates Piano A with shots on first scene open", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page
      .getByRole("button")
      .filter({ hasText: /SC\.\d+/ });
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

    // The plan chip is a button ("○ Piano A"); scope to it so it doesn't collide
    // with the "Il piano attivo è nascosto — Piano A" banner that also contains
    // the text.
    await expect(
      page.getByRole("button", { name: /Piano A/ }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/shot/).first()).toBeVisible({
      timeout: 10_000,
    });

    // BlockingCard shows "SUGGERITO" (uppercase) when the plan was auto-suggested
    await expect(page.getByText("SUGGERITO")).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-022b] Quick-add toolbar adds shot to active plan", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page
      .getByRole("button")
      .filter({ hasText: /SC\.\d+/ });
    await sceneButtons.first().click();

    // The quick-add toolbar appears once a scene is open.
    const toolbar = page.getByRole("toolbar", { name: "Quick-add shot" });
    await expect(toolbar).toBeVisible({ timeout: 15_000 });

    // The active plan may be hidden ("Il piano attivo è nascosto — mostra");
    // shots added while hidden don't render. Reveal it first.
    const showHidden = page.getByRole("button", { name: "mostra" });
    if (await showHidden.isVisible().catch(() => false)) {
      await showHidden.click();
    }

    // The shot-size buttons render their size as text; CU is the close-up size.
    const cuBtn = toolbar.locator("button", { hasText: /^CU$/ });
    await expect(cuBtn).toBeVisible({ timeout: 10_000 });
    const initialShotCount = await page.getByTestId("shot-block").count();
    await cuBtn.click();

    // Adding a shot is a server round-trip; poll until the block count grows.
    await expect
      .poll(() => page.getByTestId("shot-block").count(), { timeout: 10_000 })
      .toBeGreaterThan(initialShotCount);
  });

  test("[OHW-022b] Pattern menu shows recommended badge", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page
      .getByRole("button")
      .filter({ hasText: /SC\.\d+/ });
    await sceneButtons.first().click();

    // QuickAddToolbar renders "▼ Pattern…" button
    const patternBtn = page.getByRole("button", { name: /Pattern/ });
    await expect(patternBtn).toBeVisible({ timeout: 10_000 });
    await patternBtn.click();

    // PatternMenu renders a "consigliato" badge on the recommended pattern
    await expect(page.getByText("consigliato").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("[OHW-022b] Script panel toggles open and persists", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page
      .getByRole("button")
      .filter({ hasText: /SC\.\d+/ });
    await sceneButtons.first().click();

    // ScriptPanel collapsed tab uses aria-label="Apri pannello sceneggiatura"
    const scriptTab = page.getByRole("button", {
      name: "Apri pannello sceneggiatura",
    });
    await expect(scriptTab).toBeVisible({ timeout: 10_000 });
    await scriptTab.click();

    // When open, ScriptPanel header shows "Scena N — testo"
    await expect(page.getByText(/Scena \d+ — testo/)).toBeVisible({
      timeout: 5_000,
    });

    await page.reload();
    // Wait for scene list to re-render after reload
    await expect(
      page
        .getByRole("button")
        .filter({ hasText: /SC\.\d+/ })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await sceneButtons.first().click();
    // Panel should still be open (persisted in localStorage)
    await expect(page.getByText(/Scena \d+ — testo/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[OHW-022b] PlanPicker creates a second plan", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const sceneButtons = page
      .getByRole("button")
      .filter({ hasText: /SC\.\d+/ });
    await sceneButtons.first().click();

    await expect(
      page.getByRole("button", { name: /Piano A/ }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // PlanPicker "+ piano" button opens a popover with "Vuoto" option
    await page.getByRole("button", { name: "+ piano" }).click();
    await page.getByRole("button", { name: "Vuoto", exact: true }).click();

    await expect(
      page.getByRole("button", { name: /Piano B/ }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
