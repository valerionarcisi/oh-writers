import { expect, type Page } from "@playwright/test";

export const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:3002";

export async function waitForEditor(page: Page) {
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  return editor;
}

// Append an empty action block at the end of the doc and place the cursor in
// it. Uses the editor-exposed helper because keyboard.press("End") only moves
// to end-of-visible-line in word-wrapped paragraphs — subsequent Enter would
// split mid-paragraph instead of creating a fresh action.
export async function goToNewLine(page: Page) {
  await page.evaluate(() => {
    (
      window as unknown as { __ohWritersAppendAction?: () => void }
    ).__ohWritersAppendAction?.();
  });
  await page.waitForTimeout(50);
}

// Extract the Fountain text from the ProseMirror doc via docToFountain —
// the function is exposed on window by the editor for test access.
export async function getEditorContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    return (window as any).__ohWritersFountain?.() ?? "";
  });
}
