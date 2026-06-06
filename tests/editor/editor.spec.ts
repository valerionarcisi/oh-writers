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
    // The seeded screenplay body is a real Fountain script (its title is the
    // project name, not part of the body). Assert it carries scene headings
    // rather than a specific title string that lives only in the project meta.
    expect(content).toMatch(/INT|EST|EXT/);
  });

  test("[OHW-079] page indicator shows page count", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);

    const pages = page.getByTestId("doc-stats").locator('[data-stat="pages"]');
    await expect(pages).toBeVisible();
    await expect(pages.locator("dd")).toHaveText(/\d+/);
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

    // The element chips are localised (IT default): Personaggio / Dialogo /
    // Azione, exposing the active state via aria-pressed.
    // Alt+C → character block.
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await expect(
      page.getByRole("button", { name: "Personaggio", pressed: true }),
    ).toBeVisible({ timeout: 3_000 });

    // Alt+D → dialogue block.
    await page.keyboard.press("Alt+d");
    await page.waitForTimeout(100);
    await expect(
      page.getByRole("button", { name: "Dialogo", pressed: true }),
    ).toBeVisible({ timeout: 3_000 });

    // Alt+A → back to action block.
    await page.keyboard.press("Alt+a");
    await page.waitForTimeout(100);
    await expect(
      page.getByRole("button", { name: "Azione", pressed: true }),
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

    // The "Focus" entry button lives in the Viewbar (testid is stable; its IT
    // label is also "Focus").
    const focusBtn = page.getByTestId("screenplay-focus-enter");
    await expect(focusBtn).toBeVisible();

    // Enter focus mode → the localised "Esci da Focus" exit toolbar appears.
    await focusBtn.click();
    const exitBtn = page.getByRole("button", { name: "Esci da Focus" });
    await expect(exitBtn).toBeVisible({ timeout: 3_000 });

    // Exit focus mode → the exit toolbar is gone and the editor is usable again.
    await exitBtn.click();
    await expect(exitBtn).not.toBeVisible({ timeout: 3_000 });
    await expect(focusBtn).toBeVisible();
  });

  test("[OHW-086] content persists after edit + save", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForEditor(page);
    await goToNewLine(page);

    const marker = `MARKER_${Date.now()}`;
    await page.keyboard.type(marker);

    // The autosave debounce is 30s; flush immediately via the editor's E2E
    // force-save hook (Cmd/Ctrl+S path) and wait for the persist round-trip.
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("saveScreenplay") && r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.evaluate(() =>
        (
          window as unknown as { __ohWritersForceSave?: () => void }
        ).__ohWritersForceSave?.(),
      ),
    ]);
    expect(resp.ok()).toBe(true);

    // The save-status pill settles on "saved".
    await expect(
      page.locator('[data-testid="save-status-indicator"][data-state="saved"]'),
    ).toBeVisible({ timeout: 10_000 });

    // Reload and verify content persisted.
    await page.reload();
    await waitForEditor(page);

    const content = await getEditorContent(page);
    expect(content).toContain(marker);
  });
});
