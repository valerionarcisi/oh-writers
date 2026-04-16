/**
 * Spec 12 — Versions drawer: create + new version via toolbar
 *
 * Supersedes the old Spec 07c tests (OHW-087/088) which targeted the removed
 * /screenplay/versions route. The versioning UI now lives in the unified
 * VersionsDrawer (right-side overlay).
 *
 * [OHW-087] Create a manual version from the drawer
 * [OHW-088] Newly created version appears in the list immediately
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";

test.describe("Versioning — create", () => {
  test.beforeEach(async ({ authenticatedPage: page, testProjectId }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
  });

  test("[OHW-087] create a named version from the drawer", async ({
    authenticatedPage: page,
  }) => {
    // Open the drawer via toolbar ⋯ menu
    const menuTrigger = page.getByTestId("toolbar-menu-trigger");
    await expect(menuTrigger).toBeVisible({ timeout: 10_000 });
    await menuTrigger.click();
    await page.getByTestId("menu-item-versions").click();

    const drawer = page.getByTestId("versions-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Click "+ Nuova versione"
    const newTrigger = page.getByTestId("versions-new-trigger");
    await expect(newTrigger).toBeVisible();
    await newTrigger.click();

    // Fill label
    const input = page.getByTestId("versions-new-label-input");
    await expect(input).toBeVisible();
    const label = `E2E Draft ${Date.now()}`;
    await input.fill(label);

    // Save
    await page.getByTestId("versions-new-save").click();

    // [OHW-088] New version row appears in the drawer list
    await expect(drawer.getByText(label)).toBeVisible({ timeout: 10_000 });
  });
});
