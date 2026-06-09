/**
 * Spec 12 — Import dialog: overwrite vs. new version (OHW-178 / OHW-179)
 *
 * When a PDF is imported into a screenplay that already has content AND
 * at least one existing version, the confirmation dialog must offer two
 * distinct actions instead of the plain "Replace" button:
 *
 *   [OHW-178] "Salva come Versione N e importa" — creates a new version
 *             from the current content before replacing with the import.
 *
 *   [OHW-179] "Sovrascrivi" — replaces content directly without creating
 *             a new version.
 *
 * The "Cancel" button must always be present and must leave content unchanged.
 */

import path from "path";
import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { BASE_URL, waitForEditor, openScreenplayActionsMenu } from "../helpers";

// Open the routed Versions surface (Spec 66) from the unified TopBar version
// chip (the single entry point) and wait for the shared master→detail drawer.
async function openVersions(page: Page) {
  await page.getByTestId("topbar-version-chip").click();
  await expect(page.getByTestId("versions-split-drawer")).toBeVisible({
    timeout: 10_000,
  });
}

// Close the routed Versions surface by clearing the search param, so the ⋯
// import actions are reachable again (the lane compresses the editor lane).
async function closeVersions(page: Page) {
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.delete("versions");
    url.searchParams.delete("vkind");
    url.searchParams.delete("vcur");
    url.searchParams.delete("vstate");
    history.replaceState(null, "", url.toString());
  });
  await page.reload();
  await waitForEditor(page);
}

const PDF_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/the-wolf-of-wall-street.pdf",
);

/**
 * Open the ⋯ menu, click "Import PDF", and attach the fixture file.
 * Returns without waiting for the dialog — the caller decides what to assert.
 */
async function startImport(
  page: Parameters<Parameters<typeof test>[1]>[0]["authenticatedPage"],
) {
  await openScreenplayActionsMenu(page);
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("menu-item-import-pdf").click(),
  ]);
  await fileChooser.setFiles(PDF_FIXTURE);
}

test.describe("Import PDF — version choice dialog", () => {
  test.beforeEach(async ({ authenticatedPage: page, testProjectId }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);

    // The seed already gives this screenplay a version + live content, which is
    // the precondition for the import version-choice dialog. We must NOT create
    // a blank version here ("+ Nuova versione" now blanks the editor — Spec 66),
    // as that would wipe the content the import dialog needs.
    await openVersions(page);
    await expect(
      page.locator('[data-testid^="versions-split-row-"]').first(),
    ).toBeVisible({ timeout: 10_000 });
    await closeVersions(page);
  });

  // ─────────────────────────────────────────────────────────────────────────────

  test("[OHW-178] importing into a screenplay with versions shows the 'save as new version then import' button", async ({
    authenticatedPage: page,
  }) => {
    await startImport(page);

    const confirmDialog = page.getByTestId("import-confirm");
    await expect(confirmDialog).toBeVisible({ timeout: 15_000 });

    // The "create new version then import" button must be present
    const newVersionBtn = page.getByTestId("import-confirm-new-version");
    await expect(newVersionBtn).toBeVisible();
    // Its label must mention a version number
    await expect(newVersionBtn).toContainText(/versione/i);

    // The plain overwrite button must also be present
    await expect(page.getByTestId("import-confirm-overwrite")).toBeVisible();

    // Cancel closes the dialog without changing content
    await page.getByTestId("import-confirm-cancel").click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 3_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────────

  test("[OHW-179] 'Sovrascrivi' replaces content without creating a new version", async ({
    authenticatedPage: page,
  }) => {
    // Count versions before import (on the routed surface), then close it.
    const rowSel = '[data-testid^="versions-split-row-"]';
    await openVersions(page);
    const rowsBefore = await page.locator(rowSel).count();
    await closeVersions(page);

    await startImport(page);
    const confirmDialog = page.getByTestId("import-confirm");
    await expect(confirmDialog).toBeVisible({ timeout: 15_000 });

    // Click "Sovrascrivi"
    await page.getByTestId("import-confirm-overwrite").click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 3_000 });

    // Version count must remain unchanged
    await openVersions(page);
    const rowsAfter = await page.locator(rowSel).count();
    expect(rowsAfter).toBe(rowsBefore);
  });
});
