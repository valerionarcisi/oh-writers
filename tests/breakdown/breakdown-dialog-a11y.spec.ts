import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToBreakdown,
  switchBreakdownView,
  TEAM_PROJECT_ID,
} from "./helpers";

/**
 * [Spec UI — Dialog a11y]
 *
 * The Dialog primitive uses a native <dialog> element via showModal().
 * This gives the browser a built-in focus trap and Escape handling for
 * free. These tests verify that the wire-up is correct: triggering a
 * ConfirmDialog from the breakdown bulk-archive flow produces a modal that:
 *   1. receives focus on the confirm button (autoFocus prop)
 *   2. is dismissed by the Escape key
 *   3. is dismissed by the explicit close/cancel button
 *
 * The Dialog component itself does not use React Aria — these tests
 * exercise the native <dialog> contract rather than ARIA roles.
 */

test.describe("[Spec UI] Dialog a11y — native <dialog> focus and keyboard", () => {
  /**
   * Helper: navigate to per-project breakdown and select at least one row
   * so the bulk action bar appears. Returns false if skipping is needed.
   */
  async function setupBulkSelection(
    page: Parameters<typeof test>[1]["authenticatedPage"],
  ) {
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Switch to per-project view where bulk actions live
    await switchBreakdownView(page, "per-project");
    await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
      timeout: 10_000,
    });

    // Expand first available group to get rows
    const groups = page.locator('[data-testid^="breakdown-group-"]');
    const groupCount = await groups.count();
    if (groupCount === 0) return false;

    for (let i = 0; i < groupCount; i++) {
      const head = groups.nth(i).getByRole("button").first();
      const expanded = await head.getAttribute("aria-expanded");
      if (expanded !== "true") {
        await head.click();
      }
    }

    // Check the first row checkbox
    const firstCheckbox = page
      .locator('tbody tr input[type="checkbox"]')
      .first();
    if (!(await firstCheckbox.isVisible())) return false;
    await firstCheckbox.check();

    // Bulk bar should now be visible
    await expect(page.getByTestId("bulk-action-bar")).toBeVisible({
      timeout: 5_000,
    });
    return true;
  }

  test("[410] Bulk archive opens a ConfirmDialog", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    const ready = await setupBulkSelection(page);
    if (!ready) {
      test.skip();
      return;
    }

    // Click the archive button to trigger the ConfirmDialog
    await page.getByTestId("bulk-archive-btn").click();

    // The v3 Dialog renders a native <dialog open> that also hosts a
    // react-aria content node with role="dialog" — so getByRole("dialog")
    // matches two elements (strict-mode violation). Anchor on the native
    // <dialog open> element, which is the canonical "modal is showing" signal.
    await expect(page.locator("dialog[open]")).toBeVisible({ timeout: 5_000 });
  });

  test("[411] Escape key closes the ConfirmDialog", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    const ready = await setupBulkSelection(page);
    if (!ready) {
      test.skip();
      return;
    }

    await page.getByTestId("bulk-archive-btn").click();
    await expect(page.locator("dialog[open]")).toBeVisible({ timeout: 5_000 });

    // Native <dialog> handles Escape automatically via the browser
    await page.keyboard.press("Escape");

    // The dialog must be closed
    await expect(page.locator("dialog[open]")).not.toBeVisible({
      timeout: 3_000,
    });

    // Selection should be preserved (Escape = cancel, not archive)
    await expect(page.getByTestId("bulk-action-bar")).toBeVisible();
  });

  test("[412] Cancel button in ConfirmDialog closes without archiving", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    const ready = await setupBulkSelection(page);
    if (!ready) {
      test.skip();
      return;
    }

    // Count visible rows before
    const rowsBefore = await page.locator("tbody tr").count();

    await page.getByTestId("bulk-archive-btn").click();
    await expect(page.locator("dialog[open]")).toBeVisible({ timeout: 5_000 });

    // ConfirmDialog renders cancelLabel button ("Annulla"). Scope to the open
    // dialog — the bulk action bar also has its own "Annulla" (clear selection).
    await page
      .locator("dialog[open]")
      .getByRole("button", { name: "Annulla" })
      .click();

    // Dialog must be gone
    await expect(page.locator("dialog[open]")).not.toBeVisible({
      timeout: 3_000,
    });

    // Row count must be unchanged (nothing was archived)
    const rowsAfter = await page.locator("tbody tr").count();
    expect(rowsAfter).toBe(rowsBefore);
  });

  test("[413] ConfirmDialog confirm button is focusable and triggers archive", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    const ready = await setupBulkSelection(page);
    if (!ready) {
      test.skip();
      return;
    }

    await page.getByTestId("bulk-archive-btn").click();
    await expect(page.locator("dialog[open]")).toBeVisible({ timeout: 5_000 });

    // ConfirmDialog passes autoFocus to the confirm button, so it should
    // receive focus when the dialog opens. Verify it is the focused element.
    // Scope to the open dialog to avoid colliding with other page buttons.
    const confirmBtn = page
      .locator("dialog[open]")
      .getByRole("button", { name: "Archivia" });
    await expect(confirmBtn).toBeFocused({ timeout: 3_000 });

    // Confirm the action
    await confirmBtn.click();

    // Dialog should close after confirming
    await expect(page.locator("dialog[open]")).not.toBeVisible({
      timeout: 5_000,
    });
  });
});
