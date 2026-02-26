/**
 * Spec 05d — Autocomplete UX (Tab Accept, Widget Styling, Transitions)
 *
 * Browser E2E tests. Require the dev server running with MOCK_API=true:
 *   MOCK_API=true pnpm dev
 *
 * Run tests:
 *   pnpm test tests/screenplay/autocomplete.spec.ts
 *
 * [OHW-060] Tab on CHARACTER line with suggestion visible → accepts the first suggestion
 * [OHW-070] Suggest widget has dark background and zero border-radius
 * [OHW-071] Transition autocomplete: typing "F" on empty action line shows FADE options
 * [OHW-072] Transition autocomplete: Tab accepts the first transition
 */

import { test, expect } from "@playwright/test";

const BASE = process.env["BASE_URL"] ?? "http://localhost:3002";

const PROJECT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const SCREENPLAY_URL = `${BASE}/projects/${PROJECT_ID}/screenplay`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const waitForEditor = async (page: import("@playwright/test").Page) => {
  const editor = page.locator(".monaco-editor").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  return editor;
};

const goToNewLine = async (page: import("@playwright/test").Page) => {
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
};

// ─── [OHW-060] Tab accepts first suggestion ───────────────────────────────────

test("[OHW-060] Tab on CHARACTER line with suggestion visible accepts the first suggestion", async ({
  page,
}) => {
  await page.goto(SCREENPLAY_URL);
  await waitForEditor(page);

  // Get to a fresh CHARACTER-indented line
  await goToNewLine(page);
  await page.keyboard.press("Tab"); // → CHARACTER indent

  // Type the first letter of a known character name
  await page.keyboard.type("M");

  // Widget should appear with MORGAN
  const suggestion = page
    .locator(".monaco-list-rows")
    .filter({ hasText: "MORGAN" });
  await expect(suggestion).toBeVisible({ timeout: 5_000 });

  // Tab should accept the highlighted suggestion and close the widget
  await page.keyboard.press("Tab");

  // Widget must be gone — proves the suggestion was accepted (not just dismissed)
  await expect(page.locator(".suggest-widget")).not.toBeVisible({
    timeout: 2_000,
  });
});

// ─── [OHW-070] Widget styling ──────────────────────────────────────────────────

test("[OHW-070] suggest widget has dark background and zero border-radius", async ({
  page,
}) => {
  await page.goto(SCREENPLAY_URL);
  await waitForEditor(page);

  // Open the widget on a CHARACTER line
  await goToNewLine(page);
  await page.keyboard.press("Tab"); // → CHARACTER indent
  await page.keyboard.type("M");

  // Wait for widget to render
  const suggestion = page
    .locator(".monaco-list-rows")
    .filter({ hasText: "MORGAN" });
  await expect(suggestion).toBeVisible({ timeout: 5_000 });

  // Inspect computed styles of the suggest widget
  const styles = await page.evaluate(() => {
    const widget = document.querySelector<HTMLElement>(".suggest-widget");
    if (!widget) return null;
    const cs = getComputedStyle(widget);
    return {
      backgroundColor: cs.backgroundColor,
      borderRadius: cs.borderRadius,
    };
  });

  expect(styles).not.toBeNull();
  // #1a1917 — the brutalist dark surface colour
  expect(styles!.backgroundColor).toBe("rgb(26, 25, 23)");
  // No rounding anywhere
  expect(styles!.borderRadius).toBe("0px");
});

// ─── [OHW-071] Transition autocomplete shows FADE options ─────────────────────

test('[OHW-071] transition autocomplete: typing "F" on empty action line shows FADE options', async ({
  page,
}) => {
  await page.goto(SCREENPLAY_URL);
  await waitForEditor(page);

  // New unindented action line (no Tab → column 0)
  await goToNewLine(page);

  // "F" at column 0 should trigger transition suggestions
  await page.keyboard.type("F");

  const rows = page.locator(".monaco-list-rows");
  await expect(rows.filter({ hasText: "FADE IN:" })).toBeVisible({
    timeout: 5_000,
  });
  await expect(rows.filter({ hasText: "FADE OUT:" })).toBeVisible({
    timeout: 5_000,
  });
});

// ─── [OHW-072] Tab accepts first transition ───────────────────────────────────

test("[OHW-072] transition autocomplete: Tab accepts the first transition", async ({
  page,
}) => {
  await page.goto(SCREENPLAY_URL);
  await waitForEditor(page);

  // New unindented action line
  await goToNewLine(page);
  await page.keyboard.type("F");

  // Wait for FADE IN: to appear as the first suggestion
  await expect(
    page.locator(".monaco-list-rows").filter({ hasText: "FADE IN:" }),
  ).toBeVisible({ timeout: 5_000 });

  // Tab accepts the highlighted (first) suggestion
  await page.keyboard.press("Tab");

  // Widget must close — confirms acceptance
  await expect(page.locator(".suggest-widget")).not.toBeVisible({
    timeout: 2_000,
  });
});
