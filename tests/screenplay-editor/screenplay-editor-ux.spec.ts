/**
 * Spec 05e — Screenplay Editor UX (keyboard flow, shortcuts, toolbar, autocomplete)
 *
 * Tab/Enter flow matrix:
 * [OHW-410] Scene Heading → Enter → produces Action element
 * [OHW-411] Character → Enter → produces Dialogue element
 * [OHW-412] Dialogue → Enter → produces Character element (next speaker)
 * [OHW-413] Parenthetical → Enter → produces Dialogue
 * [OHW-414] Transition → Enter → produces Scene Heading
 * [OHW-415] Action → Tab → switches to Character
 * [OHW-416] Character → Tab → switches to Parenthetical
 * [OHW-417] Dialogue → Tab → exits to Action
 *
 * ⌘+Number shortcuts:
 * [OHW-420] ⌘+1 → Scene Heading
 * [OHW-421] ⌘+3 → Character
 * [OHW-422] ⌘+4 → Dialogue
 * [OHW-423] ⌘+6 → Transition
 *
 * Toolbar:
 * [OHW-430] Toolbar has 6 element buttons visible (scene, action, character, dialogue, parenthetical, transition)
 * [OHW-431] Active element button has aria-pressed="true"
 * [OHW-432] Clicking toolbar Character button → line switches to Character
 *
 * Autocomplete:
 * [OHW-440] On Character line, typing "(" → extension dropdown appears with V.O. option
 * [OHW-441] On Transition line → common transitions suggested
 */

import { test, expect } from "../fixtures";
import { BASE_URL, waitForEditor, goToNewLine } from "../helpers";
import type { Page } from "@playwright/test";

// "Non fa ridere" — seeded project owned by test@ohwriters.dev
const TEST_PROJECT_ID = "00000000-0000-4000-a000-000000000010";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read the ProseMirror node type name at the cursor position via the
 * window helper exposed by ProseMirrorView.tsx for E2E test access.
 */
async function focusedBlockType(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as { __ohWritersBlock?: () => string | null };
    return w.__ohWritersBlock?.() ?? "";
  });
}

/**
 * Navigate to the screenplay editor for the given project and wait for the
 * ProseMirror instance to be ready.
 */
async function openScreenplay(page: Page, projectId: string) {
  await page.goto(`${BASE_URL}/projects/${projectId}/screenplay`);
  await page.waitForLoadState("networkidle");
  await waitForEditor(page);
}

// The character autocomplete dropdown rendered by buildAutocompletePlugin.
// Unlike the slot pickers, it has no data-picker-slot attribute.
const AUTOCOMPLETE_DROPDOWN = 'ul[role="listbox"]:not([data-picker-slot])';

// ─── Tab/Enter flow matrix ────────────────────────────────────────────────────

test.describe("Tab/Enter flow matrix — Spec 05e", () => {
  test("[OHW-410] Scene Heading → Enter → produces Action element", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    // Switch current action block to a scene heading
    await page.keyboard.press("Alt+s");
    await page.waitForTimeout(100);

    // Cursor lands in prefix — type prefix, Space hops to title
    await page.keyboard.type("INT.");
    await page.keyboard.press("Space");
    await page.waitForTimeout(80);

    // Type title text then Enter
    await page.keyboard.type("OFFICE - DAY");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("action");
  });

  test("[OHW-411] Character → Enter → produces Dialogue element", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    expect(await focusedBlockType(page)).toBe("character");

    await page.keyboard.type("MARIO");
    await page.keyboard.press("Escape"); // dismiss autocomplete if open
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("dialogue");
  });

  test("[OHW-412] Dialogue → Enter (with text) → produces Character element", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    // Build character → dialogue with text
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await page.keyboard.type("MARIO");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);

    // We are now on dialogue — type text then Enter
    await page.keyboard.type("Ciao a tutti.");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    // Dialogue with text → next speaker (character)
    expect(await focusedBlockType(page)).toBe("character");
  });

  test("[OHW-413] Parenthetical → Enter → produces Dialogue element", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    // Character → Enter → Dialogue, then Alt+p to convert to parenthetical
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    await page.keyboard.type("LUIGI");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);

    // Switch to parenthetical directly
    await page.keyboard.press("Alt+p");
    await page.waitForTimeout(100);
    expect(await focusedBlockType(page)).toBe("parenthetical");

    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("dialogue");
  });

  test("[OHW-414] Transition → Enter → produces Scene Heading", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    await page.keyboard.press("Alt+t");
    await page.waitForTimeout(100);
    expect(await focusedBlockType(page)).toBe("transition");

    await page.keyboard.type("CUT TO:");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    // Transition + Enter → scene heading; cursor lands in prefix or title
    const blockType = await focusedBlockType(page);
    expect(["prefix", "title", "heading"]).toContain(blockType);
  });

  test("[OHW-415] Action → Tab → switches to Character", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    // goToNewLine leaves cursor in an action block
    expect(await focusedBlockType(page)).toBe("action");

    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("character");
  });

  test("[OHW-416] Character → Tab → switches to Parenthetical", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(200);
    expect(await focusedBlockType(page)).toBe("character");

    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    expect(await focusedBlockType(page)).toBe("parenthetical");
  });

  test("[OHW-417] Dialogue → Tab → exits to Action", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    await page.keyboard.press("Alt+d");
    await page.waitForTimeout(100);
    expect(await focusedBlockType(page)).toBe("dialogue");

    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("action");
  });
});

// ─── ⌘+Number shortcuts ───────────────────────────────────────────────────────

test.describe("Cmd+Number shortcuts — Spec 05e", () => {
  test("[OHW-420] ⌘+1 on any line → switches to Scene Heading", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    // Start from action, convert via shortcut
    expect(await focusedBlockType(page)).toBe("action");
    await page.keyboard.press("ControlOrMeta+1");
    await page.waitForTimeout(100);

    // Scene heading: cursor lands in prefix or title slot
    const blockType = await focusedBlockType(page);
    expect(["prefix", "title", "heading"]).toContain(blockType);
  });

  test("[OHW-421] ⌘+3 on any line → switches to Character", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    expect(await focusedBlockType(page)).toBe("action");
    await page.keyboard.press("ControlOrMeta+3");
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("character");
  });

  test("[OHW-422] ⌘+4 on any line → switches to Dialogue", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    expect(await focusedBlockType(page)).toBe("action");
    await page.keyboard.press("ControlOrMeta+4");
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("dialogue");
  });

  test("[OHW-423] ⌘+6 on any line → switches to Transition", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    expect(await focusedBlockType(page)).toBe("action");
    await page.keyboard.press("ControlOrMeta+6");
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("transition");
  });
});

// ─── Toolbar ──────────────────────────────────────────────────────────────────

test.describe("Element toolbar — Spec 05e", () => {
  test("[OHW-430] Toolbar has 6 element buttons visible", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);

    // ScreenplayElementChips renders a react-aria role="toolbar" with one
    // button per element. The ELEMENT_ORDER defines 6 elements.
    const toolbar = page.getByRole("toolbar", {
      name: /converti blocco corrente|convert current block/i,
    });
    await expect(toolbar).toBeVisible({ timeout: 10_000 });

    const buttons = toolbar.getByRole("button");
    await expect(buttons).toHaveCount(6);
  });

  test("[OHW-431] Active element button has aria-pressed='true'", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);

    // Place cursor in an action block and verify the Action button is pressed
    await goToNewLine(page);
    expect(await focusedBlockType(page)).toBe("action");

    const toolbar = page.getByRole("toolbar", {
      name: /converti blocco corrente|convert current block/i,
    });

    // Exactly one button must be pressed at a time
    const pressedButtons = toolbar.locator('[aria-pressed="true"]');
    await expect(pressedButtons).toHaveCount(1);

    // The pressed button must correspond to the action element
    const pressedButton = pressedButtons.first();
    const dataElement = await pressedButton.getAttribute("data-element");
    expect(dataElement).toBe("action");
  });

  test("[OHW-432] Clicking toolbar Character button → line switches to Character", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    // Confirm we start on action
    expect(await focusedBlockType(page)).toBe("action");

    const toolbar = page.getByRole("toolbar", {
      name: /converti blocco corrente|convert current block/i,
    });
    const characterButton = toolbar.locator('[data-element="character"]');
    await expect(characterButton).toBeVisible();
    await characterButton.click();
    await page.waitForTimeout(100);

    expect(await focusedBlockType(page)).toBe("character");

    // The Character button must now carry aria-pressed="true"
    await expect(characterButton).toHaveAttribute("aria-pressed", "true");
  });
});

// ─── Autocomplete ─────────────────────────────────────────────────────────────

test.describe("Autocomplete — Spec 05e", () => {
  test("[OHW-440] On Character line, typing '(' shows extension dropdown with V.O. option", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    // Switch to character block
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(100);
    expect(await focusedBlockType(page)).toBe("character");

    // Type a character name then "(" to trigger extension suggestions
    await page.keyboard.type("FILIPPO", { delay: 50 });
    await page.keyboard.press("Escape"); // dismiss any name autocomplete first
    await page.keyboard.type("(", { delay: 50 });
    await page.waitForTimeout(200);

    const dropdown = page.locator(AUTOCOMPLETE_DROPDOWN);
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    // V.O. must be in the extension list
    const voOption = dropdown.locator("li").filter({ hasText: "(V.O.)" });
    await expect(voOption).toBeVisible({ timeout: 3_000 });
  });

  test("[OHW-441] On Transition line, common transitions are suggested", async ({
    authenticatedPage: page,
  }) => {
    await openScreenplay(page, TEST_PROJECT_ID);
    await goToNewLine(page);

    // Switch to transition block
    await page.keyboard.press("Alt+t");
    await page.waitForTimeout(100);
    expect(await focusedBlockType(page)).toBe("transition");

    // Typing nothing yet — the autocomplete computes from an empty prefix,
    // so all transitions should be suggested. Type a single char to trigger.
    await page.keyboard.type("C", { delay: 50 });
    await page.waitForTimeout(200);

    const dropdown = page.locator(AUTOCOMPLETE_DROPDOWN);
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    // CUT TO: starts with "C" and must appear
    const cutToOption = dropdown.locator("li").filter({ hasText: "CUT TO:" });
    await expect(cutToOption).toBeVisible({ timeout: 3_000 });
  });
});
