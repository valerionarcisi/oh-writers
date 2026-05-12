import type { Page } from "@playwright/test";
import { BASE_URL } from "../helpers";

export const SCHEDULE_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const navigateToSchedule = async (
  page: Page,
  projectId: string,
): Promise<void> => {
  await page.goto(`${BASE_URL}/projects/${projectId}/schedule`);
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await page
    .getByTestId("generate-schedule-btn")
    .waitFor({ state: "visible", timeout: 15_000 });
};

export const generateSchedule = async (page: Page): Promise<void> => {
  const btn = page.getByTestId("generate-schedule-btn");
  const text = await btn.textContent();
  if (text?.trim() === "Genera pianificazione") {
    await btn.click();
  }
  // Always wait for the board regardless of whether we just generated or not
  await page
    .getByTestId("strip-board")
    .waitFor({ state: "visible", timeout: 30_000 });
};
