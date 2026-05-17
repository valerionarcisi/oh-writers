import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

export const LOCATIONS_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

export const SEEDED_LOCATION_REQ_1_ID = "00000000-0000-4000-a000-000000000040";
export const SEEDED_LOCATION_REQ_2_ID = "00000000-0000-4000-a000-000000000041";
export const SEEDED_LOCATION_CANDIDATE_1_ID =
  "00000000-0000-4000-a000-000000000050";
export const SEEDED_LOCATION_CANDIDATE_2_ID =
  "00000000-0000-4000-a000-000000000051";
export const SEEDED_LOCATION_BREAKDOWN_ELEMENT_NAME = "Libreria del padre";

export const navigateToLocations = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/locations`);
  await expect(page.getByTestId("locations-page")).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForLoadState("networkidle");
};
