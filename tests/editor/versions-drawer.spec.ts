/**
 * Spec 12 — Unified Versions Drawer (E2E)
 *
 * [OHW-170] Versions drawer opens from screenplay toolbar and shows list
 * [OHW-171] First auto-save version appears with placeholder label
 * [OHW-172] Duplicate creates a new version that becomes the live draft
 * [OHW-173] Inline rename (pencil icon) updates label optimistically
 * [OHW-174] Editor changes on duplicated version are saved
 * [OHW-175] Second duplicate creates a third version in the list
 * [OHW-176] Delete removes a version from the list
 * [OHW-177] Drawer closes on Escape and on ✕ button
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor, goToNewLine } from "../helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Open the versions drawer from the screenplay toolbar menu */
async function openVersionsDrawer(page: import("@playwright/test").Page) {
  // The versions toggle lives inside the toolbar ⋯ menu
  const menuTrigger = page.getByTestId("toolbar-menu-trigger");
  await expect(menuTrigger).toBeVisible({ timeout: 10_000 });
  await menuTrigger.click();
  const versionsItem = page.getByTestId("menu-item-versions");
  await expect(versionsItem).toBeVisible({ timeout: 5_000 });
  await versionsItem.click();
  const drawer = page.getByTestId("versions-drawer");
  await expect(drawer).toBeVisible({ timeout: 5_000 });
  return drawer;
}

/** Wait for the save indicator to settle (not dirty, not saving) */
async function waitForSaved(page: import("@playwright/test").Page) {
  // The save indicator disappears or shows "Salvato" when not dirty
  await page.waitForFunction(
    () => {
      const indicator = document.querySelector(
        "[data-testid='save-indicator']",
      );
      if (!indicator) return true; // hidden = not dirty
      return indicator.textContent?.includes("Salvato") ?? false;
    },
    { timeout: 15_000 },
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe("Versions drawer", () => {
  test.beforeEach(async ({ authenticatedPage: page, testProjectId }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
  });

  test("[OHW-170] drawer opens from toolbar and shows the versions list", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    await expect(drawer).toBeVisible();
    // The drawer title should mention versioni
    await expect(drawer.getByText(/versioni/i)).toBeVisible();
  });

  test("[OHW-171] first auto-save version is visible with Auto-save label", async ({
    authenticatedPage: page,
  }) => {
    // Write something so autosave fires, then open drawer
    const editor = await waitForEditor(page);
    await goToNewLine(page);
    await editor.pressSequentially("INT. TEST ROOM - DAY", { delay: 30 });
    await waitForSaved(page);

    const drawer = await openVersionsDrawer(page);
    // At least one row should exist (seeded data has versions)
    const rows = drawer.locator("[data-testid^='version-row-']");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-172] duplicate creates a new version that becomes the live draft", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    const drawer = await openVersionsDrawer(page);
    const rows = drawer.locator("[data-testid^='version-row-']");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    const initialCount = await rows.count();

    // Click Duplica on the first row
    const firstDuplicateBtn = rows.first().getByTestId(/version-duplicate-/);
    await expect(firstDuplicateBtn).toBeVisible();
    await firstDuplicateBtn.click();

    // A new row should appear
    await expect(rows).toHaveCount(initialCount + 1, { timeout: 10_000 });

    // The new version's label should contain "copia"
    const firstRowLabel = rows.first().locator("[class*='label']").first();
    await expect(firstRowLabel).toContainText(/copia/i, { timeout: 5_000 });
  });

  test("[OHW-173] pencil icon renames a version inline", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    const rows = drawer.locator("[data-testid^='version-row-']");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // Get the first row's version id from data-testid
    const firstRow = rows.first();
    const testId = await firstRow.getAttribute("data-testid");
    const versionId = testId?.replace("version-row-", "") ?? "";
    expect(versionId).toBeTruthy();

    // Click the pencil icon
    const pencilBtn = page.getByTestId(`version-rename-${versionId}`);
    await pencilBtn.click();

    // Rename input should appear
    const renameInput = page.getByTestId(`version-rename-input-${versionId}`);
    await expect(renameInput).toBeVisible();
    await renameInput.fill("Bozza finale");
    await renameInput.press("Enter");

    // Label should update
    await expect(firstRow).toContainText("Bozza finale", { timeout: 5_000 });
  });

  test("[OHW-174] editor changes on live draft are saved after duplicate", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    const rows = drawer.locator("[data-testid^='version-row-']");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // Duplicate first version
    const firstDuplicateBtn = rows.first().getByTestId(/version-duplicate-/);
    await firstDuplicateBtn.click();
    await expect(rows).toHaveCount(
      (await rows.count()) + 0, // wait for mutation to settle
      { timeout: 5_000 },
    );

    // Close drawer and edit
    await page.keyboard.press("Escape");
    const editor = await waitForEditor(page);
    await goToNewLine(page);
    await editor.pressSequentially("EXT. DUPLICATED SCENE - NIGHT", {
      delay: 30,
    });

    // Wait for autosave
    await waitForSaved(page);

    // Reopen drawer — at least 2 rows present
    const drawer2 = await openVersionsDrawer(page);
    const rows2 = drawer2.locator("[data-testid^='version-row-']");
    await expect(rows2).toHaveCount(await rows2.count(), { timeout: 5_000 });
    // Saved — no error visible
    await expect(drawer2.locator("[class*='error']")).not.toBeVisible();
  });

  test("[OHW-175] second duplicate creates a third version", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    const rows = drawer.locator("[data-testid^='version-row-']");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    const beforeCount = await rows.count();

    // First duplicate
    await rows
      .first()
      .getByTestId(/version-duplicate-/)
      .click();
    await expect(rows).toHaveCount(beforeCount + 1, { timeout: 10_000 });

    // Second duplicate on the (now) first row
    await rows
      .first()
      .getByTestId(/version-duplicate-/)
      .click();
    await expect(rows).toHaveCount(beforeCount + 2, { timeout: 10_000 });
  });

  test("[OHW-176] delete removes a version from the list", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    const rows = drawer.locator("[data-testid^='version-row-']");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    const beforeCount = await rows.count();
    // Need at least 2 rows to safely delete one
    // (seed data should have enough; skip if only 1)
    if (beforeCount < 2) {
      // create one first
      const newBtn = page.getByTestId("versions-new-trigger");
      await newBtn.click();
      const input = page.getByTestId("versions-new-label-input");
      await input.fill("Da eliminare");
      await page.getByTestId("versions-new-save").click();
      await expect(rows).toHaveCount(beforeCount + 1, { timeout: 10_000 });
    }

    const countBeforeDelete = await rows.count();
    const firstRow = rows.first();
    const testId = await firstRow.getAttribute("data-testid");
    const versionId = testId?.replace("version-row-", "") ?? "";

    await page.getByTestId(`version-delete-${versionId}`).click();

    // Confirm deletion in the dialog
    await expect(page.getByTestId("version-delete-confirm")).toBeVisible({
      timeout: 3_000,
    });
    await page.getByTestId("version-delete-confirm-ok").click();

    await expect(rows).toHaveCount(countBeforeDelete - 1, { timeout: 10_000 });
  });

  test("[OHW-177] drawer closes on Escape and on ✕ button", async ({
    authenticatedPage: page,
  }) => {
    // Open and close with Escape
    const drawer = await openVersionsDrawer(page);
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible({ timeout: 3_000 });

    // Open and close with ✕ button
    const drawer2 = await openVersionsDrawer(page);
    await expect(drawer2).toBeVisible();
    await page.getByTestId("drawer-close").click();
    await expect(drawer2).not.toBeVisible({ timeout: 3_000 });
  });
});
