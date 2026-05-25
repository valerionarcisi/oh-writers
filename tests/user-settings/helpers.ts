import { expect, type Page } from "@playwright/test";
import { BASE_URL } from "../helpers";

export const SETTINGS_URL = `${BASE_URL}/settings`;

export async function navigateToSettings(page: Page): Promise<void> {
  await page.goto(SETTINGS_URL);
  await page.waitForURL("**/settings", { timeout: 15_000 });
  await expect(page.locator("h1")).toContainText("Impostazioni account");
}

export async function waitForProfileSection(page: Page): Promise<void> {
  await expect(page.getByTestId("profile-name-input")).toBeVisible({
    timeout: 10_000,
  });
}

export async function waitForPasswordSection(page: Page): Promise<void> {
  await expect(page.getByTestId("current-password-input")).toBeVisible({
    timeout: 10_000,
  });
}
