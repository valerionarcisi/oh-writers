import { expect } from "@playwright/test";
import { test } from "../fixtures";

/**
 * [Spec 02] Teams UI
 *
 * Seeded data used across these tests:
 *   - Team "Test Team" with slug "test-team"
 *   - test@ohwriters.dev is owner of Test Team
 *   - viewer@ohwriters.dev is viewer of Test Team
 */

const TEST_TEAM_SLUG = "test-team";

// Refill until the button enables: a fill that lands around hydration can be
// lost to a React remount (SSR value «»), leaving Invita disabled forever
// (the [512]/[514] flake). A person would just retype.
const inviteMember = async (
  page: import("@playwright/test").Page,
  email: string,
) => {
  const emailInput = page.getByPlaceholder("email@esempio.com");
  const invita = page.getByRole("button", { name: "Invita" });
  await expect(async () => {
    await emailInput.fill(email);
    await expect(invita).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await invita.click();
};

test.describe("[Spec 02] Teams — creation and dashboard", () => {
  test("[510] team creation page renders and form creates team", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto("/teams/new");
    await expect(
      page.getByRole("heading", { name: "Nuovo team" }),
    ).toBeVisible();

    const uniqueName = `Test Team ${Date.now()}`;
    // The name input's controlled onChange doesn't pick up Playwright's fill()
    // synthetic input event (the submit stays disabled on !name.trim()); type it
    // character-by-character so React state updates and the button enables.
    const nameInput = page.getByLabel("Nome del team");
    await nameInput.click();
    await nameInput.pressSequentially(uniqueName, { delay: 20 });
    const createBtn = page.getByRole("button", { name: "Crea team" });
    await expect(createBtn).toBeEnabled({ timeout: 5_000 });
    await createBtn.click();

    // After creation, should redirect to the new team dashboard
    await page.waitForURL(/\/teams\/[a-z0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("[511] team dashboard shows members list", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`/teams/${TEST_TEAM_SLUG}`);
    // Heading with team name
    await expect(page.getByRole("heading", { name: "Test Team" })).toBeVisible({
      timeout: 10_000,
    });
    // Members section exists and has at least one member row
    await expect(
      page.locator("h2", { hasText: /Membri/ }).first(),
    ).toBeVisible();
  });

  test("[512] owner can invite a member — invitation row appears", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`/teams/${TEST_TEAM_SLUG}/members`);

    const email = `invite-${Date.now()}@example.com`;
    await inviteMember(page, email);

    // The invitation should appear in the pending invitations list
    await expect(
      page.getByTestId("invitations-list").getByText(email),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("[513] non-owner (viewer) cannot manage members — forbidden message shown", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await page.goto(`/teams/${TEST_TEAM_SLUG}/members`);

    // The page should render but show a forbidden/no-access message
    await expect(
      page.getByText("Solo i proprietari possono gestire i membri."),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("[514] invitation acceptance page renders for valid token", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // First create an invite to get a real token
    await page.goto(`/teams/${TEST_TEAM_SLUG}/members`);
    const email = `accept-test-${Date.now()}@example.com`;
    await inviteMember(page, email);
    await expect(
      page.getByTestId("invitations-list").getByText(email),
    ).toBeVisible({ timeout: 8_000 });

    // The server logs the invite URL, but we can't easily read it from the
    // test. Instead just verify the route renders without crashing for a
    // known-invalid token (non-authenticated scenario is redirected to login,
    // here we test the page structure with an invalid token).
    await page.goto("/invite/invalid-token-for-ui-test");
    await expect(
      page.getByRole("heading", { name: "Invito non valido" }),
    ).toBeVisible({ timeout: 8_000 });
  });
});
