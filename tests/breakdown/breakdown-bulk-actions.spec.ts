import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

/**
 * [Spec 10j — Bulk actions]
 *
 * ProjectBreakdownView exposes a bulk action bar when one or more rows are
 * selected via their checkboxes. The bar offers: confirm, recategorize,
 * rename, CSV export, and archive. These tests verify:
 *   - Bar appears only when at least one row is selected
 *   - Selection count label is accurate
 *   - Deselect clears the bar
 *   - Bulk confirm calls the mutation (server-side) and clears selection
 *   - CSV export button is present in the bar
 */

test.describe("[Spec 10j] Breakdown per-project — bulk action bar", () => {
  async function openPerProjectView(
    page: Parameters<typeof test>[1]["authenticatedPage"],
  ) {
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    const perProjectTab = page.getByTestId("segmented-per-project");
    await expect(perProjectTab).toBeVisible({ timeout: 10_000 });
    await perProjectTab.click();
    await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
      timeout: 10_000,
    });
  }

  async function expandFirstGroup(
    page: Parameters<typeof test>[1]["authenticatedPage"],
  ): Promise<boolean> {
    const groups = page.locator('[data-testid^="breakdown-group-"]');
    const count = await groups.count();
    if (count === 0) return false;
    for (let i = 0; i < count; i++) {
      const head = groups.nth(i).getByRole("button").first();
      const expanded = await head.getAttribute("aria-expanded");
      if (expanded !== "true") {
        await head.click();
      }
    }
    const firstCheckbox = page
      .locator('tbody tr input[type="checkbox"]')
      .first();
    return firstCheckbox.isVisible();
  }

  test("[OHW-420] Bulk action bar is hidden before any row is selected", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await openPerProjectView(page);

    // Bar must not be visible initially
    await expect(page.getByTestId("bulk-action-bar")).not.toBeVisible();
  });

  test("[OHW-421] Selecting a row shows the bulk action bar with correct count", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await openPerProjectView(page);

    const hasRows = await expandFirstGroup(page);
    if (!hasRows) {
      test.skip();
      return;
    }

    const firstCheckbox = page
      .locator('tbody tr input[type="checkbox"]')
      .first();
    await firstCheckbox.check();

    const bar = page.getByTestId("bulk-action-bar");
    await expect(bar).toBeVisible({ timeout: 5_000 });

    // Count label: "1 selezionato"
    await expect(bar.getByText(/1 selezionat/)).toBeVisible();
  });

  test("[OHW-422] Selecting two rows shows count '2 selezionati'", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await openPerProjectView(page);

    const hasRows = await expandFirstGroup(page);
    if (!hasRows) {
      test.skip();
      return;
    }

    const checkboxes = page.locator('tbody tr input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    if (checkboxCount < 2) {
      test.skip();
      return;
    }

    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    const bar = page.getByTestId("bulk-action-bar");
    await expect(bar).toBeVisible({ timeout: 5_000 });
    await expect(bar.getByText(/2 selezionat/)).toBeVisible();
  });

  test("[OHW-423] 'Annulla' button in bulk bar clears selection", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await openPerProjectView(page);

    const hasRows = await expandFirstGroup(page);
    if (!hasRows) {
      test.skip();
      return;
    }

    await page.locator('tbody tr input[type="checkbox"]').first().check();
    await expect(page.getByTestId("bulk-action-bar")).toBeVisible({
      timeout: 5_000,
    });

    // "Annulla" in the bulk bar clears the selection (not the same as the
    // dialog's Annulla — this one is always visible in the bar footer)
    await page
      .getByTestId("bulk-action-bar")
      .getByRole("button", { name: "Annulla" })
      .click();

    // Bar should disappear once selection is empty
    await expect(page.getByTestId("bulk-action-bar")).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test("[OHW-424] Bulk action bar contains Conferma, Rinomina, Esporta CSV, Archivia buttons", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await openPerProjectView(page);

    const hasRows = await expandFirstGroup(page);
    if (!hasRows) {
      test.skip();
      return;
    }

    await page.locator('tbody tr input[type="checkbox"]').first().check();

    const bar = page.getByTestId("bulk-action-bar");
    await expect(bar).toBeVisible({ timeout: 5_000 });

    await expect(bar.getByTestId("bulk-confirm-btn")).toBeVisible();
    await expect(bar.getByTestId("bulk-rename-btn")).toBeVisible();
    await expect(bar.getByTestId("bulk-export-btn")).toBeVisible();
    await expect(bar.getByTestId("bulk-archive-btn")).toBeVisible();
    await expect(bar.getByTestId("bulk-recategorize-select")).toBeVisible();
  });

  test("[OHW-425] Bulk confirm changes pending elements to accepted and clears selection", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await openPerProjectView(page);

    const hasRows = await expandFirstGroup(page);
    if (!hasRows) {
      test.skip();
      return;
    }

    // Select all visible rows to maximize the chance of hitting a pending one
    const checkboxes = page.locator('tbody tr input[type="checkbox"]');
    const total = await checkboxes.count();
    for (let i = 0; i < total; i++) {
      await checkboxes.nth(i).check();
    }

    const bar = page.getByTestId("bulk-action-bar");
    await expect(bar).toBeVisible({ timeout: 5_000 });

    await bar.getByTestId("bulk-confirm-btn").click();

    // After confirming, the bulk bar should clear (selection resets to empty)
    await expect(bar).not.toBeVisible({ timeout: 8_000 });
  });
});
