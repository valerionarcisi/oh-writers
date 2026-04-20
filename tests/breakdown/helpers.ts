import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

export const TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";
export const TEAM_VERSION_ID = "00000000-0000-4000-a000-000000000023";
export const TEAM_SCENE_1_ID = "00000000-0000-4000-a000-000000010010";
export const TEAM_SCENE_2_ID = "00000000-0000-4000-a000-000000010011";

export const navigateToBreakdown = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/breakdown`);
  await expect(page.getByTestId("breakdown-page")).toBeVisible({
    timeout: 10_000,
  });
};

export const openSceneInBreakdown = async (page: Page, sceneNumber: number) => {
  await page.getByTestId(`scene-toc-item-${sceneNumber}`).click();
  await expect(page.getByTestId(`scene-${sceneNumber}-heading`)).toBeVisible();
};

export const acceptGhostTag = async (page: Page, elementName: string) => {
  const tag = page.getByTestId(`ghost-tag-${elementName}`);
  await tag.click();
  await expect(page.getByTestId(`accepted-tag-${elementName}`)).toBeVisible();
};
