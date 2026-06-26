/**
 * Spec 33 — User Settings Page E2E
 *
 * Profile section:
 *   [500] Profile section renders name, email, avatar URL inputs
 *   [501] Updating name saves successfully
 *   [502] Invalid avatar URL shows validation error
 *
 * Password section:
 *   [503] Password section renders for email/password accounts
 *   [504] Wrong current password shows error
 *   [505] Password mismatch shows validation error
 *   [506] Valid password change succeeds
 *
 * Teams section:
 *   [507] Teams section lists user's teams with role
 */

import { test, expect } from "../fixtures";
import {
  navigateToSettings,
  waitForProfileSection,
  waitForPasswordSection,
} from "./helpers";

// ── Profile section ───────────────────────────────────────────────────────────

test("[500] Profile section renders name, email, avatar URL inputs", async ({
  authenticatedPage: page,
}) => {
  await navigateToSettings(page);
  await waitForProfileSection(page);

  await expect(page.getByTestId("profile-name-input")).toBeVisible();
  await expect(page.getByTestId("profile-avatar-url-input")).toBeVisible();
  await expect(page.getByTestId("profile-email")).toBeVisible();
  await expect(page.getByTestId("save-profile-btn")).toBeVisible();
});

test("[501] Updating name saves successfully", async ({
  authenticatedPage: page,
}) => {
  await navigateToSettings(page);
  await waitForProfileSection(page);

  const nameInput = page.getByTestId("profile-name-input");
  await nameInput.fill("Test User Updated");

  // The success pill auto-hides after 3s, so race the save round-trip against
  // the click and assert the (still ok) response — then catch the pill.
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("updateUserProfile") &&
        r.request().method() === "POST" &&
        r.ok(),
      { timeout: 10_000 },
    ),
    page.getByTestId("save-profile-btn").click(),
  ]);
  expect(resp.ok()).toBe(true);
  await expect(page.getByTestId("profile-success-msg")).toContainText(
    "Salvato!",
    { timeout: 5_000 },
  );

  // Restore original name so other tests are not affected.
  await nameInput.fill("Test User");
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("updateUserProfile") &&
        r.request().method() === "POST" &&
        r.ok(),
      { timeout: 10_000 },
    ),
    page.getByTestId("save-profile-btn").click(),
  ]);
});

test("[502] Invalid avatar URL shows validation error", async ({
  authenticatedPage: page,
}) => {
  await navigateToSettings(page);
  await waitForProfileSection(page);

  await page.getByTestId("profile-avatar-url-input").fill("not-a-valid-url");
  await page.getByTestId("save-profile-btn").click();

  // The avatar field FormField renders the error message as text near the input
  await expect(page.locator("text=URL non valido")).toBeVisible({
    timeout: 5_000,
  });
});

// ── Password section ──────────────────────────────────────────────────────────

test("[503] Password section renders for email/password accounts", async ({
  authenticatedPage: page,
}) => {
  await navigateToSettings(page);

  // The test user is seeded with email/password credentials, so the section
  // should be visible after account-providers query resolves.
  await waitForPasswordSection(page);

  await expect(page.getByTestId("current-password-input")).toBeVisible();
  await expect(page.getByTestId("new-password-input")).toBeVisible();
  await expect(page.getByTestId("confirm-password-input")).toBeVisible();
  await expect(page.getByTestId("save-password-btn")).toBeVisible();
});

test("[504] Wrong current password shows error", async ({
  authenticatedPage: page,
}) => {
  await navigateToSettings(page);
  await waitForPasswordSection(page);

  await page.getByTestId("current-password-input").fill("wrongpassword");
  await page.getByTestId("new-password-input").fill("newPassword123");
  await page.getByTestId("confirm-password-input").fill("newPassword123");
  await page.getByTestId("save-password-btn").click();

  // Better Auth returns an error for wrong current password
  await expect(page.getByTestId("password-api-error")).toBeVisible({
    timeout: 10_000,
  });
});

test("[505] Password mismatch shows validation error", async ({
  authenticatedPage: page,
}) => {
  await navigateToSettings(page);
  await waitForPasswordSection(page);

  await page.getByTestId("current-password-input").fill("testpassword123");
  await page.getByTestId("new-password-input").fill("newPassword123");
  await page.getByTestId("confirm-password-input").fill("differentPassword456");
  await page.getByTestId("save-password-btn").click();

  // Client-side Zod refine fires before any API call
  await expect(page.locator("text=Le password non corrispondono")).toBeVisible({
    timeout: 5_000,
  });
});

test("[506] Valid password change succeeds", async ({
  authenticatedPage: page,
}) => {
  await navigateToSettings(page);
  await waitForPasswordSection(page);

  const originalPassword = "testpassword123";
  const temporaryPassword = "tempPassword999";

  // Change to temporary password
  await page.getByTestId("current-password-input").fill(originalPassword);
  await page.getByTestId("new-password-input").fill(temporaryPassword);
  await page.getByTestId("confirm-password-input").fill(temporaryPassword);
  await page.getByTestId("save-password-btn").click();

  await expect(page.getByTestId("password-success-msg")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("password-success-msg")).toContainText(
    "Password aggiornata!",
  );

  // Restore original password so other tests are not affected
  await page.getByTestId("current-password-input").fill(temporaryPassword);
  await page.getByTestId("new-password-input").fill(originalPassword);
  await page.getByTestId("confirm-password-input").fill(originalPassword);
  await page.getByTestId("save-password-btn").click();
  await expect(page.getByTestId("password-success-msg")).toBeVisible({
    timeout: 10_000,
  });
});

// ── Teams section ─────────────────────────────────────────────────────────────

test("[507] Teams section lists user's teams with role", async ({
  authenticatedPage: page,
}) => {
  await navigateToSettings(page);
  await waitForProfileSection(page);

  // Wait for the teams query to resolve — either list or empty state appears
  const teamsList = page.getByTestId("teams-list");
  const emptyState = page.getByTestId("teams-empty-state");

  await expect(teamsList.or(emptyState)).toBeVisible({ timeout: 10_000 });

  const hasTeams = await teamsList.isVisible();
  if (hasTeams) {
    // Each team row contains a name and a role badge
    const rows = teamsList.locator('[class*="teamRow"]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // The first row should have both a team name and a role label
    const firstRow = rows.first();
    await expect(firstRow.locator('[class*="teamName"]')).toBeVisible();
    await expect(firstRow.locator('[class*="roleBadge"]')).toBeVisible();
  } else {
    await expect(emptyState).toContainText("Non fai parte di nessun team.");
  }
});
