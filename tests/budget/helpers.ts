import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

export const BUDGET_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const navigateToBudget = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/budget`);
  await expect(page.getByTestId("generate-budget-btn")).toBeVisible({
    timeout: 10_000,
  });
};

export const generateBudget = async (page: Page) => {
  const btn = page.getByTestId("generate-budget-btn");
  await btn.click();
  // Button text changes to "Rigenera" after a successful generation
  await expect(btn).toHaveText("Rigenera", { timeout: 20_000 });
};
