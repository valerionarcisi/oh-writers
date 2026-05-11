import type { Page } from "@playwright/test";
import { BASE_URL } from "../helpers";

export const SCHEDULE_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const navigateToSchedule = async (
  page: Page,
  projectId: string,
): Promise<void> => {
  await page.goto(`${BASE_URL}/projects/${projectId}/schedule`);
  await page
    .getByTestId("generate-schedule-btn")
    .waitFor({ state: "visible", timeout: 15_000 });
};

export const generateSchedule = async (page: Page): Promise<void> => {
  const btn = page.getByTestId("generate-schedule-btn");
  const text = await btn.textContent();
  if (text?.trim() === "Genera pianificazione" || text?.trim() === "Rigenera") {
    await btn.click();
    // Wait until at least one strip appears or board is visible
    await page
      .getByTestId("strip-board")
      .waitFor({ state: "visible", timeout: 15_000 });
  }
};
