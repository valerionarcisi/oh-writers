import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * Manual logline editing — write, persist, then modify.
 *
 * Covers the two-step mutation flow on the Soggetto page:
 *   1. User opens the logline popover, writes an initial logline, waits for
 *      autosave, reloads — asserts the value persisted.
 *   2. User opens the popover again, modifies the logline to a different value,
 *      waits for autosave, reloads — asserts the new value persisted and the
 *      old value is gone.
 *
 * No Cesare interaction. Runs under the `chromium` project.
 */

const SOGGETTO_URL = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

// Open the logline popover and return the textarea inside it.
async function openLoglineEditor(page: Page) {
  const pill = page.getByTestId("narrative-logline-pill");
  await expect(pill).toBeVisible({ timeout: 15_000 });
  await pill.click();
  const editor = page.getByTestId("narrative-logline-editor");
  await expect(editor).toBeVisible({ timeout: 5_000 });
  return editor;
}

// Close the popover by pressing Escape (the pill is a popover trigger).
async function closeLoglineEditor(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("narrative-logline-editor")).not.toBeVisible({
    timeout: 3_000,
  });
}

// Read the current logline value from the pill aria-label without opening the
// popover. The aria-label is `Logline: <text>` when a logline exists, or the
// generic "open" label when empty.
async function readLoglineFromPill(page: Page): Promise<string> {
  const pill = page.getByTestId("narrative-logline-pill");
  await expect(pill).toBeVisible({ timeout: 15_000 });
  const label = (await pill.getAttribute("aria-label")) ?? "";
  return label.replace(/^Logline:\s*/i, "").trim();
}

test.describe("[documents] Logline manual edit — write then modify", () => {
  test("[OHW-logline-manual-01] write a logline, confirm it persists, then modify it and confirm only the new value persists", async ({
    authenticatedPage: page,
  }) => {
    // Shorten the autosave debounce so we don't have to wait 30 s in-test.
    await page.addInitScript("window.__ohWritersAutoSaveDelayMs = 300;");

    // ── Step 1: navigate and write the initial logline ──────────────────────
    await page.goto(SOGGETTO_URL);
    await page.waitForLoadState("networkidle");

    const firstValue = `Prima logline di test — ${Date.now()}`;

    const editor = await openLoglineEditor(page);
    // Clear whatever the seed left, then fill our unique value.
    await editor.fill(firstValue);
    await expect(editor).toHaveValue(firstValue, { timeout: 5_000 });

    // Let autosave fire (debounce=300ms + round-trip margin).
    await closeLoglineEditor(page);
    await page.waitForTimeout(2_000);

    // ── Step 1 assertion: reload confirms the first value persisted ─────────
    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect
      .poll(() => readLoglineFromPill(page), { timeout: 10_000 })
      .toBe(firstValue);

    // ── Step 2: open the editor again and modify to a different value ────────
    const secondValue = `Logline modificata — ${Date.now() + 1}`;

    const editor2 = await openLoglineEditor(page);
    await editor2.fill(secondValue);
    await expect(editor2).toHaveValue(secondValue, { timeout: 5_000 });

    // Ensure the two values are distinct (guards against a Date.now() tie).
    expect(secondValue).not.toBe(firstValue);

    await closeLoglineEditor(page);
    await page.waitForTimeout(2_000);

    // ── Step 2 assertion: reload confirms the new value persisted ────────────
    await page.reload();
    await page.waitForLoadState("networkidle");

    const persisted = await expect
      .poll(() => readLoglineFromPill(page), { timeout: 10_000 })
      .toBe(secondValue);
    void persisted;

    // The old value must be gone.
    const afterLabel =
      (await page
        .getByTestId("narrative-logline-pill")
        .getAttribute("aria-label")) ?? "";
    expect(afterLabel).not.toContain(firstValue);
  });
});
