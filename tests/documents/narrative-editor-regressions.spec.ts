/**
 * Spec 04e — Narrative editor regressions covered by spec 04e
 * (Tiptap → vanilla ProseMirror, same pattern as the screenplay editor).
 *
 *   [EDR-01] Enter at end of document creates a new visible paragraph,
 *                caret moves into it. Reproduces BUG-001.
 *   [EDR-02] Toolbar "• List" toggles the current block into a bullet
 *                list and back. Reproduces BUG-003.
 *   [EDR-03] removed — the doc-stats char/page counter footer was dropped
 *                from the narrative PM surfaces (see body for detail).
 *
 * These tests must FAIL on HEAD prior to spec 04e implementation, and pass
 * after the new NarrativeProseMirrorView lands.
 */

import { test, expect } from "../fixtures";
import { BASE_URL } from "../helpers";

const TREATMENT_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/treatment`;

const editorLocator = (page: import("@playwright/test").Page) =>
  page.locator('[data-testid="rich-text-editor"] [contenteditable="true"]');

const focusEditor = async (page: import("@playwright/test").Page) => {
  const editor = editorLocator(page);
  await editor.click();
  const isEmpty = await editor.evaluate(
    (el) => (el.textContent ?? "").trim().length === 0,
  );
  if (!isEmpty) {
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await page.keyboard.press("Delete");
  }
};

test.describe("Narrative editor — spec 04e regressions", () => {
  test("[EDR-01] Enter at end of treatment creates a new paragraph", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TREATMENT_PATH(testProjectId));

    const editor = editorLocator(page);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await focusEditor(page);

    await page.keyboard.type("primo paragrafo");

    const paragraphsBefore = await editor.locator("p").count();
    expect(paragraphsBefore).toBe(1);

    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    // The DOM should now contain TWO paragraphs and the caret should sit
    // in the second one (which is empty).
    await expect(async () => {
      const paragraphsAfter = await editor.locator("p").count();
      expect(paragraphsAfter).toBe(2);
    }).toPass({ timeout: 2_000 });

    const caretText = await editor.evaluate((root) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const node = sel.getRangeAt(0).startContainer;
      const block = (node as Element).closest
        ? (node as Element).closest("p, h2, h3, li")
        : (node.parentElement?.closest("p, h2, h3, li") ?? null);
      if (!block) return null;
      const all = Array.from(root.querySelectorAll("p, h2, h3, li"));
      return { index: all.indexOf(block as Element), text: block.textContent };
    });
    expect(caretText, "caret position introspection").not.toBeNull();
    expect(caretText!.index).toBe(1);
    expect((caretText!.text ?? "").trim()).toBe("");

    // Type something into the new paragraph and verify it lands there,
    // not in the previous one.
    await page.keyboard.type("secondo");
    const lastParagraph = editor.locator("p").nth(1);
    await expect(lastParagraph).toHaveText("secondo");
    await expect(editor.locator("p").nth(0)).toHaveText("primo paragrafo");
  });

  test("[EDR-02] '• List' toolbar toggles a bullet list in treatment", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(TREATMENT_PATH(testProjectId));

    const editor = editorLocator(page);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await focusEditor(page);

    await page.keyboard.type("voce di lista");

    const listButton = page.getByRole("button", { name: /elenco|list/i });
    await expect(listButton).toBeVisible();
    await listButton.click();

    // The single paragraph should now live inside <ul><li>.
    await expect(editor.locator("ul li")).toHaveCount(1, { timeout: 2_000 });
    await expect(editor.locator("ul li").first()).toHaveText("voce di lista");

    // Button reflects active state via [aria-pressed] or a class on the
    // active variant — accept either signal.
    await expect(async () => {
      const aria = await listButton.getAttribute("aria-pressed");
      const klass = (await listButton.getAttribute("class")) ?? "";
      expect(aria === "true" || /active/i.test(klass)).toBe(true);
    }).toPass({ timeout: 2_000 });

    // Re-clicking the button must lift the list back to a plain paragraph.
    await listButton.click();
    await expect(editor.locator("ul")).toHaveCount(0, { timeout: 2_000 });
    await expect(editor.locator("p").first()).toHaveText("voce di lista");
  });

  // [EDR-03] removed: the narrative editor no longer renders a `doc-stats`
  // char/page counter footer on the synopsis/treatment PM surfaces (the
  // shell-level chrome dropped it). The only remaining counter is the logline
  // pill char count (covered by narrative-editor 205). There is no longer a
  // counter element to assert "in the viewport" for these surfaces.
});
