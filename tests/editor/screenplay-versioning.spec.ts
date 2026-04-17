/**
 * Spec 06b — Universal Versioning on the Screenplay Editor
 *
 * [OHW-258] Screenplay gets the same popover / menu / diff UX as narratives,
 *           and legacy "AUTO-*" entries are gone from the list.
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";

test.describe("Screenplay versioning — universal popover", () => {
  test("[OHW-258] popover lists versions, no AUTO-* labels, compare renders", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);

    const trigger = page.getByTestId("versions-menu-trigger");
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    const popover = page.getByTestId("versions-menu-popover");
    await expect(popover).toBeVisible();

    const rows = page.locator('[data-testid^="versions-menu-row-"]');
    await expect(rows.first()).toBeVisible();

    // No more auto-versioning: labels must never start with "AUTO-".
    const labels = await rows.allTextContents();
    for (const label of labels) {
      expect(label).not.toMatch(/AUTO-/);
    }

    // Duplicate to guarantee ≥2 versions so Compare is enabled.
    const before = await rows.count();
    await page.getByTestId("versions-menu-duplicate").click();
    await page.waitForTimeout(500);
    await trigger.click();
    await expect(rows).toHaveCount(before + 1);

    // Compare opens the modal
    const compareBtn = page.getByTestId("versions-menu-compare");
    await expect(compareBtn).toBeVisible();
    await compareBtn.click();
    await expect(page.getByTestId("version-compare-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("version-compare-modal")).toBeHidden();
  });
});
