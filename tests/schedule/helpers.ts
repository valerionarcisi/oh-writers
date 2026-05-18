import type { Page } from "@playwright/test";
import { BASE_URL } from "../helpers";

export const SCHEDULE_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const navigateToSchedule = async (
  page: Page,
  projectId: string,
): Promise<void> => {
  await page.goto(`${BASE_URL}/projects/${projectId}/schedule`);
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  // Accept either pre-generated board or the initial generate button
  await Promise.race([
    page
      .getByTestId("strip-board")
      .waitFor({ state: "visible", timeout: 15_000 }),
    page
      .getByTestId("generate-schedule-btn")
      .waitFor({ state: "visible", timeout: 15_000 }),
  ]);
};

export const generateSchedule = async (page: Page): Promise<void> => {
  // If board already exists (seed pre-generates), nothing to do
  const boardVisible = await page
    .getByTestId("strip-board")
    .isVisible()
    .catch(() => false);
  if (boardVisible) return;

  const btn = page.getByTestId("generate-schedule-btn");
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();
  await page
    .getByTestId("strip-board")
    .waitFor({ state: "visible", timeout: 30_000 });
};
