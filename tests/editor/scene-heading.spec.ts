/**
 * Spec 05g — Structured Scene Heading E2E Tests
 *
 * [OHW-090] Heading renders as prefix + title slots
 * [OHW-091] Tab inside prefix → cursor moves to title
 * [OHW-092] Space inside prefix → cursor moves to title (no space inserted)
 * [OHW-093] Backspace at start of title → cursor to end of prefix (no delete)
 * [OHW-094] Enter inside title → action block created below
 * [OHW-095] Alt+S on body block → new scene, cursor in prefix
 * [OHW-096] Prefix picker shows vocabulary from doc
 */

import { test, expect } from "../fixtures";
import { BASE_URL } from "../helpers";

type TestPage = Parameters<typeof test>[2]["page"];

async function waitForPmEditor(page: TestPage) {
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  return editor;
}

// Returns the pm-* class corresponding to the PM node under the cursor.
// Consults `__ohWritersBlock` because the DOM Selection API resolves to the
// parent heading element when the cursor sits inside an empty prefix/title
// inline span, producing a misleading className.
async function focusedSlot(page: TestPage): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as { __ohWritersBlock?: () => string | null };
    const type = w.__ohWritersBlock?.() ?? "";
    const map: Record<string, string> = {
      prefix: "pm-heading-prefix",
      title: "pm-heading-title",
      heading: "pm-heading",
      action: "pm-action",
      character: "pm-character",
      dialogue: "pm-dialogue",
      parenthetical: "pm-parenthetical",
      transition: "pm-transition",
    };
    return map[type] ?? "";
  });
}

// Click into the ProseMirror editor at a specific element using real mouse
// coordinates. Scroll it into view first. PM relies on native pointer events
// to set its selection — synthetic dispatchEvent is not enough.
async function focusSlot(page: TestPage, selector: string, nth = 0) {
  const el = page.locator(selector).nth(nth);
  await el.scrollIntoViewIfNeeded();
  await expect(el).toBeVisible({ timeout: 5_000 });
  // Get centre coordinates and use native mouse click so PM processes the event
  const box = await el.boundingBox();
  if (!box)
    throw new Error(`Cannot get bounding box for ${selector} nth=${nth}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // Give PM one tick to settle selection
  await page.waitForTimeout(80);
}

// Find index of the first heading that has both a non-empty prefix and title.
async function firstFullHeadingIndex(page: TestPage): Promise<number> {
  const count = await page.locator(".pm-heading-prefix").count();
  for (let i = 0; i < count; i++) {
    const p = await page.locator(".pm-heading-prefix").nth(i).textContent();
    const t = await page.locator(".pm-heading-title").nth(i).textContent();
    if (p && p.trim().length > 0 && t && t.trim().length > 0) return i;
  }
  return -1;
}

test.describe("Structured Scene Heading [OHW-09x]", () => {
  test.beforeEach(async ({ authenticatedPage: page, testProjectId }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForPmEditor(page);
  });

  // ─── OHW-090 ────────────────────────────────────────────────────────────────

  test("[OHW-090] heading renders prefix + title spans", async ({
    authenticatedPage: page,
  }) => {
    // Scroll to first numbered heading to make it visible
    const firstNumbered = page
      .locator("h2.pm-heading[data-number]")
      .filter({ hasNotAttribute: "data-number", hasText: "" })
      .or(page.locator("h2.pm-heading").filter({ hasAttribute: "data-number" }))
      .first();
    await firstNumbered.scrollIntoViewIfNeeded();

    // Every heading must contain both child spans
    const prefixes = page.locator(".pm-heading-prefix");
    const titles = page.locator(".pm-heading-title");
    const count = await page.locator("h2.pm-heading").count();
    expect(count).toBeGreaterThan(0);
    expect(await prefixes.count()).toBe(count);
    expect(await titles.count()).toBe(count);

    // At least one heading has a non-empty prefix
    const prefixTexts = await prefixes.allTextContents();
    expect(prefixTexts.some((t) => t.trim().length > 0)).toBe(true);

    // data-number attribute exists
    const numbered = page.locator("h2.pm-heading[data-number]");
    expect(await numbered.count()).toBeGreaterThan(0);
  });

  // ─── OHW-091 ────────────────────────────────────────────────────────────────

  test("[OHW-091] Tab inside prefix → cursor moves to title", async ({
    authenticatedPage: page,
  }) => {
    const idx = await firstFullHeadingIndex(page);
    expect(idx).toBeGreaterThanOrEqual(0);

    await focusSlot(page, ".pm-heading-prefix", idx);
    expect(await focusedSlot(page)).toContain("pm-heading-prefix");

    await page.keyboard.press("Tab");

    expect(await focusedSlot(page)).toContain("pm-heading-title");
  });

  // ─── OHW-092 ────────────────────────────────────────────────────────────────

  test("[OHW-092] Space inside prefix → cursor moves to title (no space inserted)", async ({
    authenticatedPage: page,
  }) => {
    const idx = await firstFullHeadingIndex(page);
    expect(idx).toBeGreaterThanOrEqual(0);

    await focusSlot(page, ".pm-heading-prefix", idx);
    await page.keyboard.press("End");
    expect(await focusedSlot(page)).toContain("pm-heading-prefix");

    const prefixBefore = await page
      .locator(".pm-heading-prefix")
      .nth(idx)
      .textContent();

    await page.keyboard.press("Space");

    expect(await focusedSlot(page)).toContain("pm-heading-title");

    // Prefix text must not have a trailing space added
    const prefixAfter = await page
      .locator(".pm-heading-prefix")
      .nth(idx)
      .textContent();
    expect(prefixAfter).toBe(prefixBefore);
  });

  // ─── OHW-093 ────────────────────────────────────────────────────────────────

  test("[OHW-093] Backspace at start of title → cursor to prefix (no delete)", async ({
    authenticatedPage: page,
  }) => {
    const idx = await firstFullHeadingIndex(page);
    expect(idx).toBeGreaterThanOrEqual(0);

    const originalPrefix = await page
      .locator(".pm-heading-prefix")
      .nth(idx)
      .textContent();
    const originalTitle = await page
      .locator(".pm-heading-title")
      .nth(idx)
      .textContent();

    // Focus prefix → Tab to title → Home to offset 0
    await focusSlot(page, ".pm-heading-prefix", idx);
    expect(await focusedSlot(page)).toContain("pm-heading-prefix");
    await page.keyboard.press("Tab");
    expect(await focusedSlot(page)).toContain("pm-heading-title");
    await page.keyboard.press("Home");

    await page.keyboard.press("Backspace");

    // Cursor must have jumped to prefix
    expect(await focusedSlot(page)).toContain("pm-heading-prefix");

    // Text unchanged
    const newPrefix = await page
      .locator(".pm-heading-prefix")
      .nth(idx)
      .textContent();
    const newTitle = await page
      .locator(".pm-heading-title")
      .nth(idx)
      .textContent();
    expect(newPrefix).toBe(originalPrefix);
    expect(newTitle).toBe(originalTitle);
  });

  // ─── OHW-094 ────────────────────────────────────────────────────────────────

  test("[OHW-094] Enter inside title → action block created below", async ({
    authenticatedPage: page,
  }) => {
    const idx = await firstFullHeadingIndex(page);
    expect(idx).toBeGreaterThanOrEqual(0);

    const actionsBefore = await page.locator(".pm-action").count();

    // Focus prefix → Tab to title → End → Enter
    await focusSlot(page, ".pm-heading-prefix", idx);
    expect(await focusedSlot(page)).toContain("pm-heading-prefix");
    await page.keyboard.press("Tab");
    expect(await focusedSlot(page)).toContain("pm-heading-title");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    // Cursor lands in an action block
    expect(await focusedSlot(page)).toContain("pm-action");

    // One more action in the doc
    const actionsAfter = await page.locator(".pm-action").count();
    expect(actionsAfter).toBeGreaterThan(actionsBefore);

    // Undo
    await page.keyboard.press("Meta+z");
  });

  // ─── OHW-095 ────────────────────────────────────────────────────────────────

  test("[OHW-095] Alt+S on body block → new scene, cursor in prefix", async ({
    authenticatedPage: page,
  }) => {
    // Navigate into an action block that is definitely inside a numbered scene.
    // We use focusSlot on the first full heading's prefix, then Enter to create
    // an action, then Alt+S on that fresh action — guaranteed to be in a real scene.
    const idx = await firstFullHeadingIndex(page);
    expect(idx).toBeGreaterThanOrEqual(0);

    // Go to title → End → Enter to create an action
    await focusSlot(page, ".pm-heading-prefix", idx);
    await page.keyboard.press("Tab");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await focusedSlot(page)).toContain("pm-action");

    const headingsBefore = await page.locator("h2.pm-heading").count();

    // Now Alt+S should split the scene and create a new heading
    await page.keyboard.press("Alt+s");
    await page.waitForTimeout(100);

    const headingsAfter = await page.locator("h2.pm-heading").count();
    expect(headingsAfter).toBeGreaterThan(headingsBefore);

    expect(await focusedSlot(page)).toContain("pm-heading-prefix");

    // Undo both actions (Enter + Alt+S)
    await page.keyboard.press("Meta+z");
    await page.keyboard.press("Meta+z");
  });

  // ─── OHW-096 ────────────────────────────────────────────────────────────────

  test("[OHW-096] prefix picker opens with doc vocabulary on input", async ({
    authenticatedPage: page,
  }) => {
    // Create a fresh scene with an empty prefix to type into.
    // Navigate from a real numbered heading → Enter to get an action
    // → Alt+S to create a new scene with empty prefix.
    const idx = await firstFullHeadingIndex(page);
    expect(idx).toBeGreaterThanOrEqual(0);
    await focusSlot(page, ".pm-heading-prefix", idx);
    await page.keyboard.press("Tab");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    expect(await focusedSlot(page)).toContain("pm-action");
    await page.keyboard.press("Alt+s");
    await page.waitForTimeout(100);
    expect(await focusedSlot(page)).toContain("pm-heading-prefix");

    // Type "I" — doc has "INT." headings, picker should appear
    await page.keyboard.type("I");

    const picker = page.locator('ul[data-picker-slot="prefix"]');
    await expect(picker).toBeVisible({ timeout: 2_000 });

    const texts = await picker.locator("li").allTextContents();
    expect(texts.some((t) => t.includes("INT."))).toBe(true);

    // Dismiss and undo
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+z");
    await page.keyboard.press("Meta+z");
  });
});
