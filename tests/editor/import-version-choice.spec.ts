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
import { BASE_URL, waitForEditor } from "../helpers";

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
  await page.getByTestId("toolbar-menu-trigger").click();
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

    // Ensure at least one version exists by creating one via the drawer
    await page.getByTestId("toolbar-menu-trigger").click();
    await page.getByTestId("menu-item-versions").click();
    const drawer = page.getByTestId("versions-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const newTrigger = page.getByTestId("versions-new-trigger");
    await expect(newTrigger).toBeVisible();
    await newTrigger.click();
    const input = page.getByTestId("versions-new-label-input");
    await input.fill("Versione base");
    await page.getByTestId("versions-new-save").click();
    await expect(drawer.getByText("Versione base")).toBeVisible({
      timeout: 10_000,
    });

    // Close the drawer
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible({ timeout: 3_000 });
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
    testProjectId,
  }) => {
    // Count versions before import
    await page.getByTestId("toolbar-menu-trigger").click();
    await page.getByTestId("menu-item-versions").click();
    const drawer = page.getByTestId("versions-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    const rowsBefore = await drawer
      .locator('[data-testid^="version-row-"]')
      .count();
    await page.keyboard.press("Escape");

    await startImport(page);
    const confirmDialog = page.getByTestId("import-confirm");
    await expect(confirmDialog).toBeVisible({ timeout: 15_000 });

    // Click "Sovrascrivi"
    await page.getByTestId("import-confirm-overwrite").click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 3_000 });

    // Version count must remain unchanged
    await page.getByTestId("toolbar-menu-trigger").click();
    await page.getByTestId("menu-item-versions").click();
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    const rowsAfter = await drawer
      .locator('[data-testid^="version-row-"]')
      .count();
    expect(rowsAfter).toBe(rowsBefore);
  });
});
