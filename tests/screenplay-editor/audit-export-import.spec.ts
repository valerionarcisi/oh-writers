/**
 * Audit ALTO #5 + #6 — Export + Import reachability.
 *
 * Regression guard for the consolidated audit (2026-05-31) and Spec 55a:
 *   #5 Screenplay PDF export must be reachable from the UI.
 *   #6 All imports must be reachable.
 *
 * Spec 55a moved export/import/Versioni into the single TopBar actions menu
 * (`screenplay-actions-menu`), one home for every page action.
 *
 * [OHW-audit-export] The TopBar "Esporta PDF" entry opens the export modal,
 *   with all 5 production formats selectable inside it.
 * [OHW-audit-import] The TopBar import entries are reachable and open a picker.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";

const SCREENPLAY_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/screenplay`;

const openScreenplayActions = async (page: Page): Promise<void> => {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await expect(page.getByTestId("screenplay-actions-menu")).toBeVisible({
    timeout: 5_000,
  });
};

test.describe("Audit ALTO #5/#6 — Export & Import reachable (TopBar)", () => {
  test("[OHW-audit-export] Esporta opens the export modal with all 5 formats", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    await openScreenplayActions(page);
    const exportItem = page.getByTestId("screenplay-export-pdf");
    await expect(exportItem).toBeVisible({ timeout: 5_000 });
    await exportItem.click();

    const modal = page.getByTestId("screenplay-export-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });
    // The format picker lives inside the modal now.
    for (const id of [
      "standard",
      "sides",
      "ad_copy",
      "reading_copy",
      "one_scene_per_page",
    ]) {
      await expect(
        modal.getByTestId(`screenplay-export-format-${id}`),
      ).toBeVisible();
    }
    await expect(page.getByTestId("screenplay-export-generate")).toBeEnabled();
  });

  test("[OHW-audit-import] TopBar exposes the import entries", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    await openScreenplayActions(page);

    const importPdf = page.getByTestId("menu-item-import-pdf");
    const importFountain = page.getByTestId("menu-item-import-fountain");
    await expect(importPdf).toBeVisible();
    await expect(importFountain).toBeVisible();

    // The Fountain entry opens a file picker — the import UI is reachable.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await importFountain.click();
    expect(await fileChooserPromise).toBeTruthy();
  });

  test("[OHW-audit-import] dashboard 'Importa Fountain' is enabled and opens a picker", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");

    const button = page.getByTestId("dashboard-import-fountain").first();
    await expect(button).toBeVisible({ timeout: 10_000 });
    await expect(button).toBeEnabled();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await button.click();
    expect(await fileChooserPromise).toBeTruthy();
  });
});
