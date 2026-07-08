// tests/mvp-surface-smoke.spec.ts
//
// [MVP] Stable-surface content smoke.
//
// Per commit 9a1a4a89 ("hide Budget/Location/Piano di ripresa in
// production"), the stable, production-visible MVP surface is:
//   Logline → Soggetto → Sinossi → Scaletta → Trattamento → Sceneggiatura,
//   Breakdown, Calendario.
// Budget, Location, and Piano di ripresa are DEV_ONLY (hidden + unreachable
// in production) and are intentionally NOT covered here.
//
// This complements route-smoke.spec.ts ([056], status-code + no-JS-error
// only) by asserting each MVP page actually RENDERS its core content, not
// just that it doesn't crash — a page that 200s but shows a blank shell
// would pass [056] and fail here.
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";

const PID = TEST_TEAM_PROJECT_ID;

test.describe("[MVP] stable-surface pages show their core content", () => {
  test("Logline redirects into Soggetto (authored inline there, no standalone page)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/logline`);
    await expect(page).toHaveURL(new RegExp(`/projects/${PID}/soggetto$`));
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Soggetto page loads its editor shell", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/soggetto`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Sinossi page loads the narrative editor shell", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/synopsis`);
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Scaletta page loads the narrative editor shell", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/outline`);
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Trattamento page loads the narrative editor shell", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/treatment`);
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Sceneggiatura page renders at least one scene heading", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/screenplay`);
    await expect(page.locator(".pm-heading").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Breakdown page loads its content shell", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Calendario (schedule) page loads its content shell", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PID}/schedule`);
    await expect(page.getByTestId("schedule-page-v2")).toBeVisible({
      timeout: 10_000,
    });
  });
});
