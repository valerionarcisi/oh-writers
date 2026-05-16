import type { Page } from "@playwright/test";
import { BASE_URL } from "../helpers";

export const SHOOTING_PLAN_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const navigateToShootingPlan = async (
  page: Page,
  projectId: string,
): Promise<void> => {
  await page.goto(`${BASE_URL}/projects/${projectId}/shooting-plan`);
  await page.waitForLoadState("networkidle");
};
