import { test, expect } from "./fixtures";

/**
 * Spec 88 — free-tier launch legal baseline: /privacy and /terms render,
 * register blocks submission without consent, and the cookie notice
 * dismisses and stays dismissed.
 */
test.describe("[Spec 88] legal baseline", () => {
  test("/privacy and /terms render and are linked from register", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("link", { name: /terms of service/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /privacy policy/i }),
    ).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByText(/draft/i).first()).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByText(/draft/i).first()).toBeVisible();
  });

  test("register is blocked without consent and unblocked once checked", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    const unique = Date.now();
    await page.getByLabel(/^name/i).fill("Test User");
    await page
      .getByLabel(/^email/i)
      .fill(`legal-baseline-${unique}@ohwriters.dev`);
    await page.getByLabel(/^password/i).fill("password123");

    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/you must accept/i)).toBeVisible();
    await expect(page).toHaveURL(/\/register/);

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  });

  test("cookie notice dismisses and stays dismissed after reload", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const banner = page.getByTestId("cookie-banner");
    await expect(banner).toBeVisible();

    await banner.getByRole("button", { name: /got it/i }).click();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
  });
});
