import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  BUDGET_PROJECT_ID,
  navigateToBudget,
  generateBudget,
  openCategoryView,
  firstFlatRowId,
} from "./helpers";

/**
 * Spec 11b (v2) — Budget dashboard (master→detail flat rate-card).
 *
 * The budget was overhauled: a SegmentedControl (overview / category / day /
 * weekly). The overview shows category cards (`category-card-cast|crew|…`); the
 * "category" view renders the per-line flat rate-card (CategoryFlatTable) where
 * each line has a name + an editable quantity (`flat-qty-<id>`) and rate
 * (`flat-rate-<id>`) cell (click → `<testid>-input` → Enter), grouped by section
 * with an add-line (`flat-add-crew`). Generation is the FloatingDock "Rigenera".
 *
 * Removed vs the old rule-based dashboard: per-resource `resource-row-*`,
 * day-rate / regime (×1.20) cells, and the scene-chip cast filter no longer
 * exist (OHW-353 / OHW-355 dropped).
 *
 *   [OHW-351] Generate → Cast + Troupe category cards are populated.
 *   [OHW-352] Edit a line's rate in the flat table → its row total updates.
 *   [OHW-354] Edit shooting days → the toolbar chip reflects the new value.
 *   [OHW-356] Add a custom crew line in the flat table → it appears.
 */

test.describe("[Spec 11b] Budget — flat rate-card dashboard", () => {
  // Each test navigates fresh; budget state persists across tests in this run.
  // Tests are ordered: generate first, then mutate.

  test("[OHW-351] Genera budget → Cast and Troupe cards are populated", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);
    await generateBudget(page);

    // The overview shows the category cards. Cast + Crew (Troupe) are derived
    // from the breakdown — both must be present with a non-empty role count.
    const castCard = page.getByTestId("category-card-cast");
    const crewCard = page.getByTestId("category-card-crew");
    await expect(castCard).toBeVisible({ timeout: 10_000 });
    await expect(crewCard).toBeVisible();
    // The card text carries the role count ("… N ruoli"); after a generate from
    // a breakdown with cast + crew, neither is "0 ruoli".
    await expect(crewCard).not.toContainText(/\b0 ruoli\b/);

    // The flat rate-card view lists the individual lines.
    await openCategoryView(page);
    await expect(
      page.locator('[data-testid^="flat-rate-"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-352] Editing a line's rate updates that line's total", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    // Ensure a budget exists.
    const dock = page.getByRole("button", { name: /Rigenera|Regenerate/ });
    if (!(await dock.isVisible().catch(() => false))) {
      await generateBudget(page);
    }

    await openCategoryView(page);
    const rowId = await firstFlatRowId(page);

    // The line row carries a total cell; capture it, then bump the rate.
    const row = page.locator(`[data-row-id="${rowId}"]`);
    const totalBefore = (await row.textContent())?.trim() ?? "";

    const rateCell = page.getByTestId(`flat-rate-${rowId}`);
    await rateCell.click();
    const input = page.getByTestId(`flat-rate-${rowId}-input`);
    await input.fill("999");
    await input.press("Enter");

    // The row's total recomputes (qty × 999), so the row text changes and now
    // contains the new rate.
    await expect
      .poll(async () => (await row.textContent())?.trim() ?? "", {
        timeout: 8_000,
      })
      .not.toBe(totalBefore);
    await expect(page.getByTestId(`flat-rate-${rowId}`)).toContainText("999", {
      timeout: 5_000,
    });
  });

  test("[OHW-354] Editing shooting days updates the toolbar chip", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    const daysChip = page.getByTestId("shooting-days");
    await expect(daysChip).toBeVisible({ timeout: 10_000 });

    // The SettingChip is a button that swaps to a number input on click — the
    // input is rendered under the same `shooting-days` testid.
    await daysChip.click();
    const input = page.locator('input[data-testid="shooting-days"]');
    await input.fill("15");
    await input.press("Enter");

    // The idle chip now shows 15.
    await expect(page.getByTestId("shooting-days")).toContainText("15", {
      timeout: 8_000,
    });
  });

  test("[OHW-356] Add a custom crew line → it appears in the flat table", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBudget(page, BUDGET_PROJECT_ID);

    const dock = page.getByRole("button", { name: /Rigenera|Regenerate/ });
    if (!(await dock.isVisible().catch(() => false))) {
      await generateBudget(page);
    }

    await openCategoryView(page);

    // The crew section exposes an add-line affordance.
    const addBtn = page.getByTestId("flat-add-crew");
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const name = `Drone Operator ${Date.now()}`;
    const addInput = page.getByPlaceholder(/ruolo|role/i);
    await expect(addInput).toBeVisible({ timeout: 5_000 });
    await addInput.fill(name);
    await addInput.press("Enter");

    // The new crew line appears in the table.
    await expect(page.getByText(name)).toBeVisible({ timeout: 8_000 });
  });
});
