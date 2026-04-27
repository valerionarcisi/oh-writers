import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

// Seeded team project (see packages/db/src/seed/index.ts). The owner fixture
// has edit rights on it; the viewer has read-only rights.
export const TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const navigateToSoggetto = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/soggetto`);
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 10_000,
  });
};

export const navigateToProjectDashboard = async (
  page: Page,
  projectId: string,
) => {
  await page.goto(`${BASE_URL}/projects/${projectId}`);
  await expect(
    page.getByRole("heading", { level: 2, name: /Narrative/i }),
  ).toBeVisible({
    timeout: 10_000,
  });
};
