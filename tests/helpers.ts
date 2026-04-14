import { expect, type Page } from "@playwright/test";

export const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:3002";

export async function waitForEditor(page: Page) {
  const editor = page.locator(".monaco-editor").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  return editor;
}

export async function goToNewLine(page: Page) {
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
}

export async function getEditorContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = (window as any).monaco?.editor?.getEditors()?.[0];
    return editor?.getValue() ?? "";
  });
}
