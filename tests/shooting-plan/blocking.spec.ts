import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { SHOOTING_PLAN_PROJECT_ID, navigateToShootingPlan } from "./helpers";

test.describe("[OHW-022c] 2D Scene Blocking Render", () => {
  test("[OHW-022c-01] Blocking card renders instead of placeholder on scene select", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
    await expect(scenes.first()).toBeVisible({ timeout: 15_000 });
    await scenes.first().click();

    // Old placeholder text must not appear
    await expect(
      page.getByText("Blocking 2D — disponibile in versione futura"),
    ).not.toBeVisible({ timeout: 5_000 });

    // BlockingCard renders "ANTEPRIMA BLOCKING · SC.N"
    await expect(page.getByText(/ANTEPRIMA BLOCKING/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("[OHW-022c-02] Cesare precompilato shows SUGGERITO badge on first open", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
    const unplanned = scenes.filter({ hasText: "non pianificata" }).first();
    const found = await unplanned.count();
    if (found === 0) {
      test.skip();
      return;
    }
    await unplanned.click();

    // BlockingCard shows uppercase SUGGERITO badge when blocking.isSuggested is true
    await expect(page.getByText("SUGGERITO")).toBeVisible({ timeout: 20_000 });
  });

  test("[OHW-022c-03] Blocking card has ⌘B editor button", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
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

    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
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

    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
    await scenes.first().click();

    const editorBtn = page.getByRole("button", { name: /⌘B Editor/ });
    await expect(editorBtn).toBeVisible({ timeout: 15_000 });
    await editorBtn.click();

    await expect(page).toHaveURL(/blocking-editor/, { timeout: 10_000 });

    // Close button text is "← Chiudi" — no aria-label override
    await page.getByRole("button", { name: "← Chiudi" }).click();
    await expect(page).not.toHaveURL(/blocking-editor/, { timeout: 10_000 });
  });

  test("[OHW-022c-06] Vista 3D button is disabled", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
    await scenes.first().click();

    const vista3dBtn = page.getByRole("button", { name: /Vista 3D/ });
    await expect(vista3dBtn).toBeVisible({ timeout: 15_000 });
    await expect(vista3dBtn).toBeDisabled();
  });

  test("[OHW-022c-07] Legend shows Camera, Personaggio, Arredo labels", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
    await scenes.first().click();

    // Legend symbols come from CSS ::before pseudo-elements; only text content is accessible.
    // BlockingCard renders spans with text "Camera", "Personaggio", "Arredo"
    // and aria-label attributes for reliable selection.
    const legend = page.getByLabel("Legenda blocking");
    await expect(legend).toBeVisible({ timeout: 15_000 });
    await expect(legend.getByText("Camera")).toBeVisible();
    await expect(legend.getByText("Personaggio")).toBeVisible();
    await expect(legend.getByText("Arredo")).toBeVisible();
  });

  test("[OHW-022c-08] Blocking editor draw tool buttons are visible", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const scenes = page.getByRole("button").filter({ hasText: /SC\.\d+/ });
    await scenes.first().click();

    const editorBtn = page.getByRole("button", { name: /⌘B Editor/ });
    await expect(editorBtn).toBeVisible({ timeout: 15_000 });
    await editorBtn.click();

    await expect(page).toHaveURL(/blocking-editor/, { timeout: 10_000 });

    // BlockingEditorToolbar renders tool buttons with labels from TOOLS array
    await expect(
      page.getByRole("button", { name: /Seleziona/ }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Parete/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: /Mobile/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("button", { name: /Apertura/ }),
    ).toBeVisible({ timeout: 5_000,
    });
  });
});
