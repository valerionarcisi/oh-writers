import { expect, type Page } from "@playwright/test";

// Mirror the port resolution in `playwright.config.ts` / `fixtures.ts`: the
// browser must navigate to the same server Playwright started, even when
// `WEB_PORT` is overridden. See the note in `fixtures.ts`.
const WEB_PORT = process.env["WEB_PORT"] ?? "3002";
export const BASE_URL =
  process.env["BASE_URL"] ?? `http://localhost:${WEB_PORT}`;

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

// Open the screenplay's TopBar "Altre azioni" menu (Spec 55a). Export, import,
// Versioni, renumber and title-page actions all live here — the single home
// that replaced the in-editor ⋯ ToolbarMenu.
//
// The click is forced and retried: right after a PDF import the editor
// repaginates the fresh document over many frames, and the sticky TopBar
// jiggles enough that Playwright's actionability gate reports the trigger
// "not stable" until the 30s test timeout (traced in #116 — the button is
// present, enabled and functional the whole time; a person just clicks it).
// The truth condition is the MENU OPENING, so that closes the retry loop,
// not the stability heuristic.
export async function openScreenplayActionsMenu(page: Page): Promise<void> {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await trigger.click({ force: true, timeout: 2_000 });
    await expect(page.getByTestId("screenplay-actions-menu")).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
}
