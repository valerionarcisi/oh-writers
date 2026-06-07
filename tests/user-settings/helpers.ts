import { expect, type Page } from "@playwright/test";
import { BASE_URL } from "../helpers";

export const SETTINGS_URL = `${BASE_URL}/settings`;

export async function navigateToSettings(page: Page): Promise<void> {
  await page.goto(SETTINGS_URL);
  await page.waitForURL("**/settings", { timeout: 15_000 });
  await expect(page.locator("h1")).toContainText("Impostazioni account");
}

export async function waitForProfileSection(page: Page): Promise<void> {
  const nameInput = page.getByTestId("profile-name-input");
  await expect(nameInput).toBeVisible({ timeout: 10_000 });
  // The profile loads async (getUserProfile) and repopulates the controlled
  // `name`/`avatarUrl` state after mount. Filling before that lands would have
  // the refetch clobber the typed value (and the save then validates the stale
  // state). Wait for the name field to be populated AND for the loading query to
  // settle (networkidle) so a late repopulation can't race a subsequent fill.
  await expect(nameInput).not.toHaveValue("", { timeout: 10_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => {});
}

export async function waitForPasswordSection(page: Page): Promise<void> {
  await expect(page.getByTestId("current-password-input")).toBeVisible({
    timeout: 10_000,
  });
}
