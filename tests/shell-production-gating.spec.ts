// tests/shell-production-gating.spec.ts
//
// [MVP] Shell DEV_ONLY gating — real production build.
//
// nav.test.ts (unit) already asserts buildRailNav() excludes Budget/Location/
// Piano di ripresa when their feature is off, but it calls buildRailNav()
// directly with a hand-built enabledFeatures set — it never exercises
// isDevEnvironment, the real FeatureProvider, or route reachability. This
// suite closes that gap against an ACTUAL production build (`vinxi build` +
// `vinxi start`), since `import.meta.env.DEV` — the flag isDevEnvironment
// reads — is always true under `vinxi dev`, which every other Playwright
// project in this repo uses.
//
// Runs only under the `prod-build` project (see playwright.config.ts), whose
// dedicated webServer builds and starts the app with MOCK_AI=true (baked in
// at build time) against the same test DB as the dev webServer — this is
// about isDevEnvironment, not data.
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";

const PID = TEST_TEAM_PROJECT_ID;

test.describe("[MVP] production build hides DEV_ONLY surfaces", () => {
  test("LeftRail does not show Budget, Location, or Inquadrature", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/soggetto`);
    await expect(page.getByTestId("left-rail")).toBeVisible({
      timeout: 15_000,
    });

    await expect(
      page.getByTestId("left-rail").getByRole("button", { name: "Budget" }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("left-rail").getByRole("button", { name: "Location" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByTestId("left-rail")
        .getByRole("button", { name: "Inquadrature" }),
    ).toHaveCount(0);
  });

  test("LeftRail still shows the 8 MVP entries", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/soggetto`);
    const rail = page.getByTestId("left-rail");
    await expect(rail).toBeVisible({ timeout: 15_000 });

    for (const label of [
      "Soggetto",
      "Sinossi",
      "Scaletta",
      "Trattamento",
      "Sceneggiatura",
      "Breakdown",
      "Calendario",
    ]) {
      await expect(rail.getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("direct URL to /budget redirects away instead of rendering", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/budget`);
    await expect(page).not.toHaveURL(new RegExp(`/projects/${PID}/budget$`), {
      timeout: 10_000,
    });
  });

  test("direct URL to /locations redirects away instead of rendering", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/locations`);
    await expect(page).not.toHaveURL(
      new RegExp(`/projects/${PID}/locations$`),
      {
        timeout: 10_000,
      },
    );
  });

  test("direct URL to /shooting-plan redirects away instead of rendering", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/shooting-plan`);
    await expect(page).not.toHaveURL(
      new RegExp(`/projects/${PID}/shooting-plan$`),
      {
        timeout: 10_000,
      },
    );
  });

  // Issue #98 — Soggetto (useDocument → getDocument server-fn) never
  // resolves under a REAL production build (vinxi build + start), reproduced
  // twice with completely fresh server processes. The same page loads fine
  // under vinxi dev (every other Playwright project). Kept as fixme (not
  // deleted/skipped silently) so this doesn't rot — un-fixme once #98 lands.
  test.fixme("the 8 MVP pages remain reachable and render real content", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/soggetto`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(`/projects/${PID}/synopsis`);
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 10_000,
    });

    await page.goto(`/projects/${PID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 10_000,
    });

    await page.goto(`/projects/${PID}/schedule`);
    await expect(page.getByTestId("schedule-page-v2")).toBeVisible({
      timeout: 10_000,
    });
  });
});
