import { expect } from "@playwright/test";
import { test, BASE_URL } from "../fixtures";
import { navigateToShootingPlan, SHOOTING_PLAN_PROJECT_ID } from "./helpers";

// The LeftRail nav item for the shooting plan is the "Inquadrature" entry
// (nav.shootingPlan), a button with data-rail-item="shooting-plan" that routes
// to /shooting-plan — not a "Piano di Ripresa" link. Scope by the rail item
// attribute so it doesn't collide with the page's "Pre-popola le inquadrature"
// button (which also matches the accessible name on the shooting-plan page).
const railShootingPlanItem = (page: import("@playwright/test").Page) =>
  page.locator('[data-rail-item="shooting-plan"]');

test.describe("[OHW-22-nav] Piano di Ripresa — sidebar navigation", () => {
  // [OHW-22-nav-1] The shooting-plan rail entry appears in project nav
  test("[OHW-22-nav-1] Inquadrature nav item is visible in project sidebar", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`${BASE_URL}/projects/${SHOOTING_PLAN_PROJECT_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(railShootingPlanItem(page)).toBeVisible({ timeout: 10_000 });
  });

  // [OHW-22-nav-2] Clicking the nav item navigates to the shooting plan page
  test("[OHW-22-nav-2] Clicking Inquadrature navigates to the shooting-plan route", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`${BASE_URL}/projects/${SHOOTING_PLAN_PROJECT_ID}`);
    await page.waitForLoadState("networkidle");

    const navItem = railShootingPlanItem(page);
    await expect(navItem).toBeVisible({ timeout: 10_000 });
    await navItem.click();

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

  // Supplementary: the nav item is marked active (aria-current) on the route.
  test("[OHW-22-nav-4] Inquadrature nav item is marked active on the shooting-plan page", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToShootingPlan(page, SHOOTING_PLAN_PROJECT_ID);

    const navItem = railShootingPlanItem(page);
    await expect(navItem).toBeVisible({ timeout: 10_000 });
    // The rail marks the active section with aria-current="page".
    await expect(navItem).toHaveAttribute("aria-current", "page", {
      timeout: 5_000,
    });
  });
});
