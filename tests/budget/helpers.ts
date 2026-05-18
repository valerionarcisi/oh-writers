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

export const generateBudget = async (page: Page) => {
  const btn = page.getByTestId("generate-budget-btn");
  const btnVisible = await btn.isVisible().catch(() => false);
  if (!btnVisible) return; // budget already generated (seed pre-populates)
  await btn.click();
  // Button text changes to "Rigenera" after a successful generation
  await expect(btn).toHaveText("Rigenera", { timeout: 20_000 });
};
