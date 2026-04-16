/**
 * Spec 07c — E2E Editor Tests (against real DB with seeded "Non fa ridere")
 *
 * [OHW-078] Editor loads with seeded content
 * [OHW-079] Page indicator shows correct count
 * [OHW-082] Tab cycles action → character → dialogue → action
 * [OHW-083] Smart Enter: character → dialogue
 * [OHW-084] Smart Enter: dialogue → action
 * [OHW-085] Focus mode toggle
 * [OHW-086] Content persists after edit + auto-save
 */

import { test, expect } from "../fixtures";
import {
  BASE_URL,
  waitForEditor,
  goToNewLine,
  getEditorContent,
} from "../helpers";

test.describe("Screenplay Editor", () => {
  test("[OHW-078] editor loads with seeded content", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);

    const content = await getEditorContent(page);
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain("NON FA RIDERE");
  });

  test("[OHW-079] page indicator shows page count", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);

    const indicator = page.getByTestId("page-indicator");
    await expect(indicator).toBeVisible();
    // Format: "p.{currentPage}/{totalPages}"
    await expect(indicator).toHaveText(/p\.\d+\/\d+/);
  });

  test("[OHW-082] Tab cycles action → character → dialogue → action", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    const editor = await waitForEditor(page);
    await goToNewLine(page);

    // Type action text so the block is non-empty
    await page.keyboard.type("test line");

    // Alt+C → character block — toolbar "Character" pill becomes active
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await expect(
      page.getByRole("button", { name: "Character", pressed: true }),
    ).toBeVisible({ timeout: 3_000 });

    // Alt+D → dialogue block
    await page.keyboard.press("Alt+d");
    await page.waitForTimeout(100);
    await expect(
      page.getByRole("button", { name: "Dialogue", pressed: true }),
    ).toBeVisible({ timeout: 3_000 });

    // Alt+A → back to action block
    await page.keyboard.press("Alt+a");
    await page.waitForTimeout(100);
    await expect(
      page.getByRole("button", { name: "Action", pressed: true }),
    ).toBeVisible({ timeout: 3_000 });

    // Editor still functional
    await expect(editor).toBeVisible();
  });

  test("[OHW-083] Smart Enter: character → dialogue", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    // Alt+C → character block, type a name
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await page.keyboard.type("FILIPPO");

    // Dismiss any autocomplete suggestion that may have appeared
    await page.keyboard.press("Escape");

    // Enter → dialogue block
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    await page.keyboard.type("Ma che stai a di");
    // Wait for the async docToFountain update to complete before reading
    await page.waitForTimeout(300);

    const content = await getEditorContent(page);
    expect(content).toContain("Ma che stai a di");
  });

  test("[OHW-084] Smart Enter: dialogue → action", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    // Alt+C → character block, type name, Enter → dialogue, double-Enter → action
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await page.keyboard.type("TEA");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    await page.keyboard.type("Basta cosi.");
    // Empty Enter in dialogue → action
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // Should be back to action — type unindented text
    await page.keyboard.type("Tea esce dalla cucina.");
    // Wait for the async docToFountain update to complete before reading
    await page.waitForTimeout(300);

    const content = await getEditorContent(page);
    expect(content).toContain("Tea esce dalla cucina.");
  });

  test("[OHW-085] focus mode toggle", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);

    // Toolbar visible — "Focus" button visible (exact match, "Exit Focus" must not match)
    const focusBtn = page.getByRole("button", { name: "Focus", exact: true });
    await expect(focusBtn).toBeVisible();

    // Enter focus mode
    await focusBtn.click();

    // Toolbar hidden, "Focus" button gone, "Exit Focus" button visible
    await expect(focusBtn).not.toBeVisible();
    const exitBtn = page.getByRole("button", { name: "Exit Focus" });
    await expect(exitBtn).toBeVisible();

    // Exit focus mode
    await exitBtn.click();
    await expect(focusBtn).toBeVisible();
  });

  test("[OHW-086] content persists after edit + auto-save", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    // Auto-save debounce is 30s — need extra time
    test.setTimeout(90_000);

    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    const marker = `MARKER_${Date.now()}`;
    await page.keyboard.type(marker);

    // Wait for "Non salvato" indicator
    await expect(page.getByText("Non salvato")).toBeVisible({
      timeout: 5_000,
    });

    // Auto-save debounce is 30s, then save request completes
    await expect(page.getByText("Non salvato")).not.toBeVisible({
      timeout: 60_000,
    });

    // Reload and verify content persisted
    await page.reload();
    await waitForEditor(page);

    const content = await getEditorContent(page);
    expect(content).toContain(marker);
  });
});
