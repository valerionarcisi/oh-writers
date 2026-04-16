/**
 * Spec 12 — Versions drawer: version switching + delete confirmation
 *
 * [OHW-180] Clicking a version row in the drawer loads that version's content
 *           into the editor (view mode).
 * [OHW-181] Duplicating a version creates a new row with "(copia)" in its label.
 * [OHW-182] Clicking "Elimina" on a version row shows a confirmation dialog
 *           before deleting.
 * [OHW-183] Cancelling the delete confirmation leaves the version intact.
 * [OHW-184] Confirming the delete confirmation removes the version from the list.
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Open the versions drawer via the ⋯ toolbar menu. */
async function openVersionsDrawer(
  page: Parameters<Parameters<typeof test>[1]>[0]["authenticatedPage"],
) {
  await page.getByTestId("toolbar-menu-trigger").click();
  await page.getByTestId("menu-item-versions").click();
  const drawer = page.getByTestId("versions-drawer");
  await expect(drawer).toBeVisible({ timeout: 5_000 });
  return drawer;
}

/** Create a named version from the already-open drawer. */
async function createVersion(
  page: Parameters<Parameters<typeof test>[1]>[0]["authenticatedPage"],
  label: string,
) {
  await page.getByTestId("versions-new-trigger").click();
  await page.getByTestId("versions-new-label-input").fill(label);
  await page.getByTestId("versions-new-save").click();
  const drawer = page.getByTestId("versions-drawer");
  await expect(drawer.getByText(label)).toBeVisible({ timeout: 10_000 });
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

test.describe("Versioning — switching and deleting", () => {
  test.beforeEach(async ({ authenticatedPage: page, testProjectId }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
  });

  // ───────────────────────────────────────────────────────────────────────────

  test("[OHW-180] clicking a version row enters view mode for that version", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);

    // Ensure at least one version exists
    await createVersion(page, `Switch Test ${Date.now()}`);

    // The first version row
    const firstRow = drawer.locator('[data-testid^="version-row-"]').first();
    await expect(firstRow).toBeVisible();

    // Click the row body (left edge — avoids the transparent rename pencil button
    // which sits near the center of the row and would intercept a centered click)
    await firstRow.click({ position: { x: 8, y: 8 } });

    // A viewing banner should appear (it shows the label + a "Return" / "Torna" button)
    const banner = page.locator('[data-testid="version-viewing-banner"]');
    await expect(banner).toBeVisible({ timeout: 8_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────

  test("[OHW-181] duplicating a version adds a '(copia)' row to the list", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    const baseLabel = `Dup Source ${Date.now()}`;
    await createVersion(page, baseLabel);

    // Find the row for the version we just created and click Duplica
    const rows = drawer.locator('[data-testid^="version-row-"]');
    const targetRow = rows.filter({ hasText: baseLabel });
    await expect(targetRow).toBeVisible();

    const duplicateBtn = targetRow.locator(
      '[data-testid^="version-duplicate-"]',
    );
    await duplicateBtn.click();

    // A new row with "(copia)" suffix should appear
    await expect(
      drawer.getByText(new RegExp(`${baseLabel} \\(copia\\)`)),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────

  test("[OHW-182] clicking Elimina shows the delete confirmation dialog", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    await createVersion(page, `Delete Dialog Test ${Date.now()}`);

    // Two versions should exist (the auto-created "Versione 1" + the one we just made)
    // Pick the one we just created
    const rows = drawer.locator('[data-testid^="version-row-"]');
    const firstRow = rows.first();
    const deleteBtn = firstRow.locator('[data-testid^="version-delete-"]');
    await deleteBtn.click();

    // Confirm dialog must appear
    await expect(page.getByTestId("version-delete-confirm")).toBeVisible({
      timeout: 3_000,
    });
  });

  // ───────────────────────────────────────────────────────────────────────────

  test("[OHW-183] cancelling the delete confirmation leaves the version intact", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    const label = `Cancel Delete Test ${Date.now()}`;
    await createVersion(page, label);

    const rows = drawer.locator('[data-testid^="version-row-"]');
    const countBefore = await rows.count();

    const firstRow = rows.first();
    await firstRow.locator('[data-testid^="version-delete-"]').click();
    await expect(page.getByTestId("version-delete-confirm")).toBeVisible();

    // Cancel
    await page.getByTestId("version-delete-confirm-cancel").click();
    await expect(page.getByTestId("version-delete-confirm")).not.toBeVisible({
      timeout: 3_000,
    });

    // Row count unchanged
    await expect(rows).toHaveCount(countBefore);
  });

  // ───────────────────────────────────────────────────────────────────────────

  test("[OHW-184] confirming deletion removes the version from the list", async ({
    authenticatedPage: page,
  }) => {
    const drawer = await openVersionsDrawer(page);
    const label = `Confirm Delete Test ${Date.now()}`;
    await createVersion(page, label);

    const rows = drawer.locator('[data-testid^="version-row-"]');
    const countBefore = await rows.count();

    // Delete the first row
    const firstRow = rows.first();
    await firstRow.locator('[data-testid^="version-delete-"]').click();
    await expect(page.getByTestId("version-delete-confirm")).toBeVisible();
    await page.getByTestId("version-delete-confirm-ok").click();

    // Dialog closes and row count decreases by 1
    await expect(page.getByTestId("version-delete-confirm")).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(rows).toHaveCount(countBefore - 1, { timeout: 10_000 });
  });
});
