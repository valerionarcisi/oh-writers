/**
 * Spec 07c — E2E Autocomplete Tests
 *
 * [OHW-080] Character autocomplete suggests FILIPPO
 * [OHW-081] Character autocomplete suggests TEA
 * [OHW-070] Suggest widget styling (border-radius: 8px)
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor, goToNewLine } from "../helpers";

test.describe("Character Autocomplete", () => {
  test("[OHW-080] autocomplete suggests FILIPPO when typing F", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    // Tab to CHARACTER indent, type "F", then trigger autocomplete
    await page.keyboard.press("Tab");
    await page.keyboard.type("F", { delay: 100 });
    await page.keyboard.press("Control+Space");

    // Monaco suggest widget should show FILIPPO
    const suggestion = page
      .locator(".monaco-list-rows")
      .filter({ hasText: "FILIPPO" });
    await expect(suggestion).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-081] autocomplete suggests TEA when typing T", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    // Tab to CHARACTER indent, type "T", then trigger autocomplete
    await page.keyboard.press("Tab");
    await page.keyboard.type("T", { delay: 100 });
    await page.keyboard.press("Control+Space");

    const suggestion = page
      .locator(".monaco-list-rows")
      .filter({ hasText: "TEA" });
    await expect(suggestion).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-070] suggest widget has rounded corners (border-radius: 8px)", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    await page.keyboard.press("Tab");
    await page.keyboard.type("F", { delay: 100 });
    await page.keyboard.press("Control+Space");

    const suggestWidget = page.locator(".editor-widget.suggest-widget");
    await expect(suggestWidget).toBeVisible({ timeout: 5_000 });

    const borderRadius = await suggestWidget.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(borderRadius).toBe("8px");
  });
});
