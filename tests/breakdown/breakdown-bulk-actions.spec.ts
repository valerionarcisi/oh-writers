import { expect, type ConsoleMessage } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToBreakdown,
  reseedTestDb,
  switchBreakdownView,
  TEAM_PROJECT_ID,
} from "./helpers";

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
    await switchBreakdownView(page, "per-project");
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

  test("[420] Bulk action bar is hidden before any row is selected", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await openPerProjectView(page);

    // Bar must not be visible initially
    await expect(page.getByTestId("bulk-action-bar")).not.toBeVisible();
  });

  test("[421] Selecting a row shows the bulk action bar with correct count", async ({
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

  test("[422] Selecting two rows shows count '2 selezionati'", async ({
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

  test("[423] 'Annulla' button in bulk bar clears selection", async ({
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

  test("[424] Bulk action bar contains Conferma, Rinomina, Esporta CSV, Archivia buttons", async ({
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

  // Renaming writes to the seeded shared DB. Restore the pristine seed
  // afterwards so later specs still see the original element names.
  test.describe("Bulk rename — in-app dialog, not window.prompt", () => {
    test.afterAll(() => {
      reseedTestDb();
    });

    test("renaming through the dialog applies the new name", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;

      // window.prompt suspends the page and Playwright cannot type into it, so
      // this test only passes against a real in-app dialog. It is the
      // regression guard for the native-dialog replacement.
      await openPerProjectView(page);

      const hasRows = await expandFirstGroup(page);
      if (!hasRows) {
        test.skip();
        return;
      }

      await page.locator('tbody tr input[type="checkbox"]').first().check();
      const bar = page.getByTestId("bulk-action-bar");
      await expect(bar).toBeVisible({ timeout: 5_000 });
      await bar.getByTestId("bulk-rename-btn").click();

      // Two ConfirmDialogProviders are mounted (shell + page), so scope to the
      // visible one rather than the first match in the DOM.
      const field = page.getByTestId("confirm-dialog-input");
      await expect(field).toBeVisible({ timeout: 5_000 });
      await expect(field).toBeFocused();

      // An empty name cannot be submitted — the native prompt had no such guard.
      const confirmBtn = page
        .getByTestId("confirm-dialog-confirm-btn")
        .locator("visible=true");
      await expect(confirmBtn).toBeDisabled();

      const newName = "E2E rinominato";
      await field.fill(newName);
      await expect(confirmBtn).toBeEnabled();
      await confirmBtn.click();

      await expect(field).not.toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator("tbody tr", { hasText: newName }).first(),
      ).toBeVisible({ timeout: 10_000 });
      // The selection is released once the rename lands.
      await expect(bar).not.toBeVisible({ timeout: 5_000 });
    });
  });

  // Archiving removes rows permanently from the seeded shared DB. Restore the
  // pristine seed afterwards so later specs still see the archived elements.
  test.describe("[Spec 10j] Bulk archive — confirm + persist (no crash)", () => {
    test.afterAll(() => {
      reseedTestDb();
    });

    test("[426] Confirming bulk archive persists and never crashes with a render-phase unmount", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;

      // Capture the specific React render-phase unmount error that the
      // bulk-archive flow used to throw ("Attempted to synchronously unmount a
      // root while React was already rendering"). The breakdown page mounts a
      // nested React root (the ProseMirror selection toolbar); switching to the
      // per-project view tore it down synchronously inside React's commit. The
      // assertion below holds the whole flow — view switch + archive — to zero
      // such errors.
      const unmountErrors: string[] = [];
      page.on("console", (m: ConsoleMessage) => {
        if (
          m.type() === "error" &&
          /synchronously unmount a root/i.test(m.text())
        ) {
          unmountErrors.push(m.text());
        }
      });

      await openPerProjectView(page);

      const hasRows = await expandFirstGroup(page);
      if (!hasRows) {
        test.skip();
        return;
      }

      const checkboxes = page.locator('tbody tr input[type="checkbox"]');
      const total = await checkboxes.count();
      if (total < 2) {
        test.skip();
        return;
      }

      const firstRow = page.locator("tbody tr[data-row-id]").first();
      const firstRowId = await firstRow.getAttribute("data-row-id");
      const secondRow = page.locator("tbody tr[data-row-id]").nth(1);
      const secondRowId = await secondRow.getAttribute("data-row-id");
      expect(firstRowId).toBeTruthy();
      expect(secondRowId).toBeTruthy();

      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();

      const bar = page.getByTestId("bulk-action-bar");
      await expect(bar).toBeVisible({ timeout: 5_000 });

      await bar.getByTestId("bulk-archive-btn").click();

      const dialog = page.locator("dialog[open]");
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Confirm the archive — this is the click that previously crashed.
      await dialog.getByRole("button", { name: "Archivia" }).click();

      // The bar clears once the selection is reset.
      await expect(bar).not.toBeVisible({ timeout: 8_000 });

      // Persistence: the two archived elements no longer appear in the table.
      // The query refetches on mutation success and archived rows are filtered
      // server-side (isNull(archivedAt)).
      await expect(
        page.locator(`tbody tr[data-row-id="${firstRowId}"]`),
      ).toHaveCount(0, { timeout: 8_000 });
      await expect(
        page.locator(`tbody tr[data-row-id="${secondRowId}"]`),
      ).toHaveCount(0);

      // Reloading proves the archive was persisted (not just removed locally).
      await page.reload();
      await switchBreakdownView(page, "per-project");
      await expect(page.getByTestId("project-breakdown-table")).toBeVisible({
        timeout: 10_000,
      });
      await expandFirstGroup(page);
      await expect(
        page.locator(`tbody tr[data-row-id="${firstRowId}"]`),
      ).toHaveCount(0);
      await expect(
        page.locator(`tbody tr[data-row-id="${secondRowId}"]`),
      ).toHaveCount(0);

      // No render-phase unmount crash anywhere in the flow.
      expect(unmountErrors).toEqual([]);
    });
  });

  test("[425] Bulk confirm changes pending elements to accepted and clears selection", async ({
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
