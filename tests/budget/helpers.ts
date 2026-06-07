import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

export const BUDGET_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const navigateToBudget = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/budget`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 });
  // budget-page-v2 is always rendered once suspense resolves
  await expect(page.getByTestId("budget-page-v2")).toBeVisible({
    timeout: 15_000,
  });
};

// Spec 44/67: budget generation is the FloatingDock primary CTA ("Rigenera",
// bottom-left), not a `generate-budget-btn`. It populates Cast/Troupe from the
// breakdown. Click it and wait for the regenerate round-trip to settle.
export const generateBudget = async (page: Page) => {
  const btn = page.getByRole("button", { name: /Rigenera|Regenerate/ });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await Promise.all([
    page
      .waitForResponse(
        (r) =>
          r.url().includes("generateBudget") && r.request().method() === "POST",
        { timeout: 20_000 },
      )
      .catch(() => undefined),
    btn.click(),
  ]);
  // After generation the dock button returns to the "Rigenera" idle label.
  await expect(btn).toHaveText(/Rigenera|Regenerate/, { timeout: 20_000 });
};

// Spec 11b v2: the budget is a SegmentedControl (overview / category / day /
// weekly). The per-line flat rate-card (CategoryFlatTable: name + editable
// quantity/rate cells, grouped by section) lives in the "category" view.
export const openCategoryView = async (page: Page) => {
  // Wait for the budget to finish loading (overview cards present) before
  // switching views — clicking the segmented tab mid-load shows an empty table.
  await expect(
    page.locator('[data-testid^="category-card-"]').first(),
  ).toBeVisible({ timeout: 15_000 });
  // Switch to the flat rate-card view and retry until its line cells render
  // (the tab + table can lag a beat behind the click after a reload).
  await expect(async () => {
    await page.getByTestId("segmented-category").click();
    await expect(
      page.locator('[data-testid^="flat-rate-"]').first(),
    ).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 20_000 });
};

// Return the row id of the first editable rate line in the flat table.
export const firstFlatRowId = async (page: Page): Promise<string> => {
  const cell = page.locator('[data-testid^="flat-rate-"]').first();
  await expect(cell).toBeVisible({ timeout: 15_000 });
  const testId = await cell.getAttribute("data-testid");
  return testId!.replace("flat-rate-", "");
};
