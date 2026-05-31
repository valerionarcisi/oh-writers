/**
 * Audit ALTO #5 + #6 — Export + Import reachability.
 *
 * Regression guard for the consolidated audit (2026-05-31):
 *   #5 Screenplay PDF export was unreachable from the UI (onExport never wired,
 *      setExportFormat never called with a non-null value).
 *   #6 All imports were unreachable (dashboard "Importa Fountain" hardcoded
 *      disabled; ToolbarMenu imported but never rendered).
 *
 * [OHW-audit-export] Editor exposes an Esporta entry that opens the export
 *   modal, with all 5 production formats selectable.
 * [OHW-audit-import] The import menu is reachable: dashboard "Importa Fountain"
 *   is enabled and the editor ToolbarMenu renders the import entries.
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";

const SCREENPLAY_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/screenplay`;

test.describe("Audit ALTO #5/#6 — Export & Import reachable", () => {
  test("[OHW-audit-export] Esporta opens the export modal with all 5 formats", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    const trigger = page.getByTestId("screenplay-export-pdf");
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await expect(trigger).toBeEnabled();
    await trigger.click();

    const menu = page.getByTestId("screenplay-export-menu");
    await expect(menu).toBeVisible({ timeout: 5_000 });
    for (const name of [
      /^Standard/,
      /^Sides/,
      /^AD copy/,
      /^Reading copy/,
      /Una scena per pagina/,
    ]) {
      await expect(menu.getByRole("menuitem", { name })).toBeVisible();
    }

    // Selecting a format actually opens the modal (the dead path before the fix).
    await menu.getByRole("menuitem", { name: /^Standard/ }).click();
    await expect(page.getByTestId("screenplay-export-modal")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("screenplay-export-generate")).toBeEnabled();
  });

  test("[OHW-audit-import] editor ToolbarMenu exposes the import entries", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    await page.getByTestId("toolbar-menu-trigger").click();
    await expect(page.getByTestId("toolbar-menu-panel")).toBeVisible();

    const importPdf = page.getByTestId("menu-item-import-pdf");
    const importFountain = page.getByTestId("menu-item-import-fountain");
    await expect(importPdf).toBeVisible();
    await expect(importPdf).toBeEnabled();
    await expect(importFountain).toBeVisible();
    await expect(importFountain).toBeEnabled();

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
