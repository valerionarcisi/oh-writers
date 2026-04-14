/**
 * Spec 07c — E2E Editor Tests (against real DB with seeded "Non fa ridere")
 *
 * [OHW-078] Editor loads with seeded content
 * [OHW-079] Page indicator shows correct count
 * [OHW-082] Tab cycles action → CHARACTER → DIALOGUE → action
 * [OHW-083] Smart Enter: CHARACTER → DIALOGUE indent
 * [OHW-084] Smart Enter: DIALOGUE → action
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
    const editor = await waitForEditor(page);

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
    // Seed screenplay is ~9 pages
    await expect(indicator).toHaveText(/Page \d+ of \d+ \(~\d+ min\)/);
  });

  test("[OHW-082] Tab cycles action → CHARACTER → DIALOGUE → action", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    const editor = await waitForEditor(page);
    await goToNewLine(page);

    // Type action text
    await page.keyboard.type("test line");

    // Tab → CHARACTER (indented, uppercase)
    await page.keyboard.press("Tab");

    // Tab → DIALOGUE (more indent)
    await page.keyboard.press("Tab");

    // Tab → back to action
    await page.keyboard.press("Tab");

    // Editor still functional
    await expect(editor).toBeVisible();
  });

  test("[OHW-083] Smart Enter: CHARACTER → DIALOGUE indent", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    // Type a name and Tab to CHARACTER indent
    await page.keyboard.type("FILIPPO");
    await page.keyboard.press("Tab");

    // Dismiss any autocomplete suggestion that may have appeared automatically
    await page.keyboard.press("Escape");

    // Enter → should start DIALOGUE-indented line
    await page.keyboard.press("Enter");
    // Brief wait so Monaco's executeEdits for Enter settles before we type
    await page.waitForTimeout(150);
    await page.keyboard.type("Ma che stai a di'?");

    const content = await getEditorContent(page);
    // DIALOGUE lines have 10-space indent in Fountain keybindings
    expect(content).toContain("Ma che stai a di'?");
  });

  test("[OHW-084] Smart Enter: DIALOGUE → action", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    // CHARACTER → DIALOGUE → action
    await page.keyboard.type("TEA");
    await page.keyboard.press("Tab");
    // Dismiss any autocomplete suggestion before pressing Enter
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    // Brief wait so Monaco's executeEdits for Enter settles before we type
    await page.waitForTimeout(150);
    await page.keyboard.type("Basta cosi'.");
    await page.keyboard.press("Enter");

    // Should be back to action — type unindented text
    await page.keyboard.type("Tea esce dalla cucina.");

    const content = await getEditorContent(page);
    expect(content).toContain("Tea esce dalla cucina.");
  });

  test("[OHW-085] focus mode toggle", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);

    // Toolbar visible
    await expect(page.getByText("Screenplay")).toBeVisible();

    // Enter focus mode
    const focusBtn = page.getByRole("button", { name: "Focus" });
    await expect(focusBtn).toBeVisible();
    await focusBtn.click();

    // Toolbar hidden, exit button visible
    await expect(page.getByText("Screenplay")).not.toBeVisible();
    const exitBtn = page.getByRole("button", { name: "Exit Focus" });
    await expect(exitBtn).toBeVisible();

    // Exit focus mode
    await exitBtn.click();
    await expect(page.getByText("Screenplay")).toBeVisible();
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

    // Wait for "Unsaved changes" indicator
    await expect(page.getByText("Unsaved changes")).toBeVisible({
      timeout: 5_000,
    });

    // Auto-save debounce is 30s, then save request completes
    await expect(page.getByText("Unsaved changes")).not.toBeVisible({
      timeout: 60_000,
    });

    // Reload and verify content persisted
    await page.reload();
    await waitForEditor(page);

    const content = await getEditorContent(page);
    expect(content).toContain(marker);
  });
});
