/**
 * Spec 07c — E2E Autocomplete Tests (ProseMirror)
 *
 * [OHW-080] Character autocomplete suggests FILIPPO
 * [OHW-081] Character autocomplete suggests TEA
 * [OHW-070] Autocomplete dropdown has rounded corners (border-radius: 4px)
 *
 * The autocomplete dropdown is a plain `ul[role="listbox"]` rendered by
 * buildAutocompletePlugin. It appears automatically when typing in a character
 * block — no Ctrl+Space trigger needed.
 * The slot pickers (prefix/title) also use `ul[role="listbox"]` but carry a
 * `data-picker-slot` attribute. The character autocomplete has none, so we
 * target `ul[role="listbox"]:not([data-picker-slot])`.
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor, goToNewLine } from "../helpers";

// The character autocomplete dropdown rendered by buildAutocompletePlugin.
// Unlike the slot pickers, it has no data-picker-slot attribute.
const AUTOCOMPLETE_DROPDOWN = 'ul[role="listbox"]:not([data-picker-slot])';

test.describe("Character Autocomplete", () => {
  test("[OHW-080] autocomplete suggests FILIPPO when typing F", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    // Alt+C → character block directly (more reliable than Tab cycling in tests)
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await page.keyboard.type("F", { delay: 100 });

    const dropdown = page.locator(AUTOCOMPLETE_DROPDOWN);
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    const suggestion = dropdown.locator("li").filter({ hasText: "FILIPPO" });
    await expect(suggestion).toBeVisible({ timeout: 3_000 });
  });

  test("[OHW-081] autocomplete suggests TEA when typing T", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    // Alt+C → character block directly
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await page.keyboard.type("T", { delay: 100 });

    const dropdown = page.locator(AUTOCOMPLETE_DROPDOWN);
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    const suggestion = dropdown.locator("li").filter({ hasText: "TEA" });
    await expect(suggestion).toBeVisible({ timeout: 3_000 });
  });

  test("[OHW-070] autocomplete dropdown has rounded corners", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await page.keyboard.type("F", { delay: 100 });

    const dropdown = page.locator(AUTOCOMPLETE_DROPDOWN);
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    // The PM autocomplete dropdown is styled with border-radius:4px inline.
    const borderRadius = await dropdown.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(borderRadius).toBe("4px");
  });
});
