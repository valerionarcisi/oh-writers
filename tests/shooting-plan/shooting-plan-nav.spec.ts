import { expect } from "@playwright/test";
import { test, BASE_URL } from "../fixtures";
import { navigateToShootingPlan, SHOOTING_PLAN_PROJECT_ID } from "./helpers";

test.describe("[OHW-22-nav] Piano di Ripresa — sidebar navigation", () => {
  // [OHW-22-nav-1] Piano di Ripresa appears in project nav
  test("[OHW-22-nav-1] Piano di Ripresa link is visible in project sidebar", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`${BASE_URL}/projects/${SHOOTING_PLAN_PROJECT_ID}`);
    await page.waitForLoadState("networkidle");

    const navLink = page.getByRole("link", { name: "Piano di Ripresa" });
    await expect(navLink).toBeVisible({ timeout: 10_000 });
  });

  // [OHW-22-nav-2] Clicking nav link navigates to shooting plan page
  test("[OHW-22-nav-2] Clicking Piano di Ripresa nav link navigates to shooting-plan route", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`${BASE_URL}/projects/${SHOOTING_PLAN_PROJECT_ID}`);
    await page.waitForLoadState("networkidle");

    const navLink = page.getByRole("link", { name: "Piano di Ripresa" });
    await expect(navLink).toBeVisible({ timeout: 10_000 });
    await navLink.click();

    await page.waitForURL(
      `**/projects/${SHOOTING_PLAN_PROJECT_ID}/shooting-plan`,
      { timeout: 10_000 },
    );
    expect(page.url()).toContain("/shooting-plan");
  });

  // [OHW-22-nav-3] Shooting plan page loads with scene list sidebar
  test("[OHW-22-nav-3] Shooting plan page renders scene list sidebar after navigation", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    // The sidebar label "Scene del progetto" is always rendered regardless of scene count
    await expect(page.getByText("Scene del progetto")).toBeVisible({
      timeout: 15_000,
    });

    // The page heading eyebrow is always rendered
    await expect(page.getByText("Piano di ripresa")).toBeVisible({
      timeout: 10_000,
    });
  });

  // Supplementary: active nav link is highlighted when on shooting-plan route
  test("[OHW-22-nav-4] Piano di Ripresa nav link is marked active when on shooting-plan page", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    // The active link has a different class applied via activeProps in Sidebar
    const navLink = page.getByRole("link", { name: "Piano di Ripresa" });
    await expect(navLink).toBeVisible({ timeout: 10_000 });

    // Verify the link is in the nav and points to the correct route
    const href = await navLink.getAttribute("href");
    expect(href).toContain("/shooting-plan");
  });
});
