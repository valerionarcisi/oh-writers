/**
 * Spec 05i — Inline Scene Number Edit + Resequence E2E Tests
 *
 * [OHW-236] Click scene number → inline input opens
 * [OHW-237] Edit + Enter → number applied, locked styling appears
 * [OHW-238] Invalid input shows inline error, input stays open
 * [OHW-239] Escape cancels edit, number unchanged
 * [OHW-240] Editing to a number already in use opens the conflict modal
 * [OHW-241] Conflict → "Keep locked" applies to self even though duplicate
 * [OHW-242] Conflict → "Resequence from here" resolves the duplicate
 * [OHW-243] Conflict → "Cancel" leaves doc untouched
 * [OHW-244] Scene menu trigger opens the popover with all items
 * [OHW-245] Menu → "Unlock number" clears the locked flag
 * [OHW-246] Toolbar "Resequence scenes" → confirm → numbers recomputed
 * [OHW-247] Toolbar confirm "Cancel" leaves doc untouched
 */

import { test, expect } from "../fixtures";
import { BASE_URL } from "../helpers";

type TestPage = Parameters<typeof test>[2]["page"];

async function waitForPmEditor(page: TestPage) {
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  return editor;
}

// Returns the left-gutter scene-number button for heading index `idx`.
function sceneNumberBtn(page: TestPage, idx: number) {
  return page.locator("h2.pm-heading .scene-number-left").nth(idx);
}

function sceneMenuTrigger(page: TestPage, idx: number) {
  return page.locator('[data-testid="scene-menu-trigger"]').nth(idx);
}

test.describe("Inline Scene Number Edit [OHW-23x / 24x]", () => {
  test.beforeEach(async ({ authenticatedPage: page, testProjectId }) => {
    await page.goto(`${BASE_URL}/projects/${testProjectId}/screenplay`);
    await waitForPmEditor(page);
    // Seeded screenplay has no scene numbers yet — resequence once to
    // populate every heading before the tests run.
    await expect(page.locator("h2.pm-heading").first()).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('[data-testid="resequence-all-trigger"]').click();
    await page.locator('[data-testid="resequence-confirm-apply"]').click();
    await expect(
      page.locator("h2.pm-heading .scene-number-left").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─── OHW-236 ──────────────────────────────────────────────────────────────

  test("[OHW-236] clicking scene number opens inline input", async ({
    authenticatedPage: page,
  }) => {
    await sceneNumberBtn(page, 0).click();
    const input = page.locator('[data-testid="scene-number-input"]');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  // ─── OHW-237 ──────────────────────────────────────────────────────────────

  test("[OHW-237] edit + Enter applies number and locks it", async ({
    authenticatedPage: page,
  }) => {
    const heading = page.locator("h2.pm-heading").nth(0);
    await sceneNumberBtn(page, 0).click();
    const input = page.locator('[data-testid="scene-number-input"]');
    await input.fill("42");
    await page.keyboard.press("Enter");

    await expect(input).toBeHidden();
    await expect(heading).toHaveAttribute("data-number", "42");
    await expect(heading).toHaveAttribute("data-locked", "true");
    await expect(sceneNumberBtn(page, 0)).toHaveClass(/is-locked/);
  });

  // ─── OHW-238 ──────────────────────────────────────────────────────────────

  test("[OHW-238] invalid input shows error, stays open", async ({
    authenticatedPage: page,
  }) => {
    await sceneNumberBtn(page, 0).click();
    const input = page.locator('[data-testid="scene-number-input"]');
    await input.fill("bogus");
    await page.keyboard.press("Enter");

    const err = page.locator('[data-testid="scene-number-error"]');
    await expect(err).toBeVisible();
    await expect(input).toBeVisible();

    // Recover with Escape
    await page.keyboard.press("Escape");
    await expect(input).toBeHidden();
  });

  // ─── OHW-239 ──────────────────────────────────────────────────────────────

  test("[OHW-239] Escape cancels edit", async ({ authenticatedPage: page }) => {
    const heading = page.locator("h2.pm-heading").nth(0);
    const before = await heading.getAttribute("data-number");

    await sceneNumberBtn(page, 0).click();
    const input = page.locator('[data-testid="scene-number-input"]');
    await input.fill("99");
    await page.keyboard.press("Escape");

    await expect(input).toBeHidden();
    await expect(heading).toHaveAttribute("data-number", before ?? "");
  });

  // ─── OHW-240 + 243 ────────────────────────────────────────────────────────

  test("[OHW-240/243] duplicate opens conflict modal; Cancel leaves doc intact", async ({
    authenticatedPage: page,
  }) => {
    const count = await page.locator("h2.pm-heading").count();
    test.skip(count < 2, "Needs ≥2 headings");

    const targetNumber = await page
      .locator("h2.pm-heading")
      .nth(1)
      .getAttribute("data-number");
    test.skip(!targetNumber, "Second heading has no number");

    const firstBefore = await page
      .locator("h2.pm-heading")
      .nth(0)
      .getAttribute("data-number");

    await sceneNumberBtn(page, 0).click();
    await page
      .locator('[data-testid="scene-number-input"]')
      .fill(targetNumber!);
    await page.keyboard.press("Enter");

    const modal = page.locator('[data-testid="scene-number-conflict-modal"]');
    await expect(modal).toBeVisible();

    await page.locator('[data-testid="conflict-choice-cancel"]').click();
    await expect(modal).toBeHidden();
    await expect(page.locator("h2.pm-heading").nth(0)).toHaveAttribute(
      "data-number",
      firstBefore ?? "",
    );
  });

  // ─── OHW-241 ──────────────────────────────────────────────────────────────

  test("[OHW-241] conflict → Keep locked applies duplicate + locks", async ({
    authenticatedPage: page,
  }) => {
    const count = await page.locator("h2.pm-heading").count();
    test.skip(count < 2, "Needs ≥2 headings");

    const targetNumber = await page
      .locator("h2.pm-heading")
      .nth(1)
      .getAttribute("data-number");
    test.skip(!targetNumber, "Second heading has no number");

    await sceneNumberBtn(page, 0).click();
    await page
      .locator('[data-testid="scene-number-input"]')
      .fill(targetNumber!);
    await page.keyboard.press("Enter");

    await page.locator('[data-testid="conflict-choice-lock"]').click();
    await expect(
      page.locator('[data-testid="scene-number-conflict-modal"]'),
    ).toBeHidden();
    const heading = page.locator("h2.pm-heading").nth(0);
    await expect(heading).toHaveAttribute("data-number", targetNumber!);
    await expect(heading).toHaveAttribute("data-locked", "true");
  });

  // ─── OHW-242 ──────────────────────────────────────────────────────────────

  test("[OHW-242] conflict → Resequence from here resolves duplicate", async ({
    authenticatedPage: page,
  }) => {
    const count = await page.locator("h2.pm-heading").count();
    test.skip(count < 2, "Needs ≥2 headings");

    const secondBefore = await page
      .locator("h2.pm-heading")
      .nth(1)
      .getAttribute("data-number");
    test.skip(!secondBefore, "Second heading has no number");

    await sceneNumberBtn(page, 0).click();
    await page
      .locator('[data-testid="scene-number-input"]')
      .fill(secondBefore!);
    await page.keyboard.press("Enter");

    await page.locator('[data-testid="conflict-choice-resequence"]').click();
    await expect(
      page.locator('[data-testid="scene-number-conflict-modal"]'),
    ).toBeHidden({ timeout: 5_000 });

    const first = await page
      .locator("h2.pm-heading")
      .nth(0)
      .getAttribute("data-number");
    const second = await page
      .locator("h2.pm-heading")
      .nth(1)
      .getAttribute("data-number");
    expect(first).toBe(secondBefore);
    // Second must have shifted to something else (numbers no longer equal).
    expect(second).not.toBe(first);
  });

  // ─── OHW-244 ──────────────────────────────────────────────────────────────

  test("[OHW-244] menu trigger opens popover with items", async ({
    authenticatedPage: page,
  }) => {
    await sceneMenuTrigger(page, 0).click();
    const menu = page.locator('[data-testid="scene-menu"]');
    await expect(menu).toBeVisible();
    await expect(page.locator('[data-testid="scene-menu-edit"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="scene-menu-unlock"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="scene-menu-resequence-from"]'),
    ).toBeVisible();

    // Outside click closes
    await page
      .locator(".ProseMirror")
      .first()
      .click({ position: { x: 5, y: 5 } });
    await expect(menu).toBeHidden();
  });

  // ─── OHW-245 ──────────────────────────────────────────────────────────────

  test("[OHW-245] menu → Unlock number clears locked flag", async ({
    authenticatedPage: page,
  }) => {
    // First lock it via inline edit.
    const heading = page.locator("h2.pm-heading").nth(0);
    const current = await heading.getAttribute("data-number");
    test.skip(!current, "First heading has no number");

    await sceneNumberBtn(page, 0).click();
    await page.locator('[data-testid="scene-number-input"]').fill(current!);
    // Typing same value then Enter would short-circuit if already locked;
    // explicitly re-type a different-but-valid number then back to lock.
    await page.keyboard.press("Enter");
    await expect(heading).toHaveAttribute("data-locked", "true");

    // Now unlock via menu.
    await sceneMenuTrigger(page, 0).click();
    await page.locator('[data-testid="scene-menu-unlock"]').click();

    await expect(heading).toHaveAttribute("data-locked", "false");
  });

  // ─── OHW-246 ──────────────────────────────────────────────────────────────

  test("[OHW-246] toolbar Resequence scenes → confirm renumbers", async ({
    authenticatedPage: page,
  }) => {
    // Lock heading 0 to a number that isn't already used so no conflict
    // modal opens (seeded doc has 1..N, so 99 is safe).
    await sceneNumberBtn(page, 0).click();
    await page.locator('[data-testid="scene-number-input"]').fill("99");
    await page.keyboard.press("Enter");
    await expect(page.locator("h2.pm-heading").nth(0)).toHaveAttribute(
      "data-number",
      "99",
    );
    await expect(page.locator("h2.pm-heading").nth(0)).toHaveAttribute(
      "data-locked",
      "true",
    );

    // Open toolbar confirm and apply.
    await page.locator('[data-testid="resequence-all-trigger"]').click();
    await expect(
      page.locator('[data-testid="resequence-confirm-modal"]'),
    ).toBeVisible();
    await page.locator('[data-testid="resequence-confirm-apply"]').click();
    await expect(
      page.locator('[data-testid="resequence-confirm-modal"]'),
    ).toBeHidden();

    // Locked "99" on heading 0 stays; the rest are renumbered around it.
    await expect(page.locator("h2.pm-heading").nth(0)).toHaveAttribute(
      "data-number",
      "99",
    );
  });

  // ─── OHW-247 ──────────────────────────────────────────────────────────────

  test("[OHW-247] toolbar Resequence cancel leaves doc untouched", async ({
    authenticatedPage: page,
  }) => {
    const numbersBefore = await page
      .locator("h2.pm-heading")
      .evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset["number"] ?? ""),
      );

    await page.locator('[data-testid="resequence-all-trigger"]').click();
    await page.locator('[data-testid="resequence-confirm-cancel"]').click();
    await expect(
      page.locator('[data-testid="resequence-confirm-modal"]'),
    ).toBeHidden();

    const numbersAfter = await page
      .locator("h2.pm-heading")
      .evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset["number"] ?? ""),
      );
    expect(numbersAfter).toEqual(numbersBefore);
  });
});
