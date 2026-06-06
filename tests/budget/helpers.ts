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
