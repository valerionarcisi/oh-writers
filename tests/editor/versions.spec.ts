/**
 * Spec 07c — E2E Versioning Tests
 *
 * [OHW-087] Create manual version
 * [OHW-088] Version diff shows changes
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor, goToNewLine } from "../helpers";

test.describe("Versioning", () => {
  test("[OHW-087] create manual version", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    // Navigate to screenplay first, then click Versions link
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);

    // Click the Versions link in the toolbar
    const versionsLink = page.getByRole("link", { name: "Versions" });
    await expect(versionsLink).toBeVisible();
    await versionsLink.click();

    // Wait for the versions page to load
    await page.waitForURL("**/screenplay/versions", { timeout: 10_000 });

    // The seeded version "v13 — 2025-11-11" should be visible
    await expect(page.getByText("v13").first()).toBeVisible({
      timeout: 10_000,
    });

    // Click "+ Save Version"
    const createBtn = page.getByRole("button", { name: /Save Version/ });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Fill the label (use click+type so React state updates per keystroke)
    const labelInput = page.getByPlaceholder(/Version label/);
    await expect(labelInput).toBeVisible();
    const versionLabel = `E2E Test ${Date.now()}`;
    await labelInput.click();
    await page.keyboard.type(versionLabel);

    // Save (exact: true avoids matching "+ Save Version")
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // New version should appear in the list
    await expect(page.getByText(versionLabel)).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-088] version diff shows changes", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    // Auto-save debounce is 30s — need extra time
    test.setTimeout(120_000);

    // First, add some content to the screenplay
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    const diffMarker = `DIFF_TEST_${Date.now()}`;
    await page.keyboard.type(diffMarker);

    // Wait for auto-save (30s debounce + save time)
    await expect(page.getByText("Unsaved changes")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Unsaved changes")).not.toBeVisible({
      timeout: 60_000,
    });

    // Navigate to versions via the Versions link
    const versionsLink = page.getByRole("link", { name: "Versions" });
    await versionsLink.click();
    await page.waitForURL("**/screenplay/versions", { timeout: 10_000 });

    // Find the seeded version and click "Diff vs current"
    const diffLink = page
      .getByRole("link", { name: "Diff vs current" })
      .first();
    await expect(diffLink).toBeVisible({ timeout: 10_000 });
    await diffLink.click();

    // Diff page should show stats
    const diffStats = page.getByTestId("diff-stats");
    await expect(diffStats).toBeVisible({ timeout: 10_000 });

    // Should show additions (our marker text was added)
    await expect(page.getByText(/\+\d+ added/)).toBeVisible();

    // The new column should contain our marker
    const newColumn = page.getByTestId("diff-new");
    await expect(newColumn).toContainText(diffMarker);
  });
});
