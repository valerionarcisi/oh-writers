/**
 * Shared ProseMirror narrative-editor test helpers (Synopsis/Treatment/
 * Outline surfaces). Extracted from documents/narrative-editor.spec.ts once
 * a second spec file (teams/team-roles-collaboration.spec.ts) needed the
 * same read/write/autosave plumbing — kept in one place so a third consumer
 * doesn't reintroduce this again.
 */
import type { Page } from "@playwright/test";

// Used to make the auto-save debounce testable (narrative docs are
// autosave-only — no manual Cmd/Ctrl+S flush). Set via page.addInitScript
// before navigation.
export const FAST_AUTOSAVE_SCRIPT = `window.__ohWritersAutoSaveDelayMs = 300;`;

// Spec 04e — synopsis/treatment use a vanilla ProseMirror contenteditable,
// not a textarea. Logline still uses a textarea via TextEditor.
export const pmEditorLocator = (page: Page) =>
  page.locator('[data-testid="rich-text-editor"] [contenteditable]');

export const focusPmEditor = async (page: Page) => {
  const editor = pmEditorLocator(page);
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

export const readPmEditorText = async (page: Page): Promise<string> => {
  const editor = pmEditorLocator(page);
  return await editor.evaluate((el) => {
    const blocks = Array.from(el.querySelectorAll("p, h2, h3, li"));
    return blocks
      .map((b) => (b.textContent ?? "").trim())
      .filter((t) => t.length > 0)
      .join("\n");
  });
};

// Waits for the saveDocument POST to land so the SaveStatus pill (or, in
// read-only mode, the caller's own assertion) can rely on the round-trip
// having actually happened, not just fired.
export const waitForAutosave = async (page: Page) => {
  await page.waitForResponse(
    (resp) =>
      resp.url().includes("saveDocument") &&
      resp.request().method() === "POST" &&
      resp.ok(),
    { timeout: 10_000 },
  );
};

// TanStack Start wraps server fn returns in a few shapes depending on the
// client; unwrap progressively until the ResultShape ({isOk, ...}) is found.
export const findResultShape = (
  input: unknown,
): { isOk: boolean; error?: { _tag?: string } } | null => {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if ("isOk" in o && typeof o["isOk"] === "boolean") {
    return o as { isOk: boolean; error?: { _tag?: string } };
  }
  for (const v of Object.values(o)) {
    const found = findResultShape(v);
    if (found) return found;
  }
  return null;
};
