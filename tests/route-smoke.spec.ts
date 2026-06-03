// tests/route-smoke.spec.ts
//
// [OHW-056] Route-coverage smoke (Spec 56, Phase 1).
//
// Visits every public-facing route as an authenticated user and asserts the
// page is actually reachable: the document response is not a 4xx/5xx and no
// uncaught error is thrown during load. This is the cheap, always-on guard
// against "parti mancanti" — dead routes, 404s, and crash-on-load regressions.
//
// New routes are added to ROUTES below as they ship; the harness grows with
// the app. Param routes use the seeded team project (TEST_TEAM_PROJECT_ID),
// which has a screenplay + breakdown + budget + schedule fixture.
import { test, expect, BASE_URL, TEST_TEAM_PROJECT_ID } from "./fixtures";
import type { Page } from "@playwright/test";

const PID = TEST_TEAM_PROJECT_ID;

// Every route that must resolve for a signed-in user. Param routes are
// concretised with the seeded project id.
const ROUTES: ReadonlyArray<string> = [
  "/dashboard",
  "/settings",
  "/projects/new",
  "/teams/new",
  `/projects/${PID}`,
  `/projects/${PID}/soggetto`,
  `/projects/${PID}/synopsis`,
  `/projects/${PID}/outline`,
  `/projects/${PID}/treatment`,
  `/projects/${PID}/screenplay`,
  `/projects/${PID}/title-page`,
  `/projects/${PID}/breakdown`,
  `/projects/${PID}/budget`,
  `/projects/${PID}/schedule`,
  `/projects/${PID}/shooting-plan`,
  `/projects/${PID}/locations`,
  `/projects/${PID}/opportunities`,
  `/projects/${PID}/settings`,
  `/projects/${PID}/sessions`,
  `/projects/${PID}/sessions/new`,
];

// Routes that SHOULD be reachable but are currently dead (404). These are
// tracked bugs from the 2026-06-03 audit (F-06 /teams, F-08 /logline); the
// fix adds redirect routes. Kept as explicit cases so a regression resurfaces.
const EXPECTED_REACHABLE: ReadonlyArray<string> = [
  "/teams",
  `/projects/${PID}/logline`,
];

const visit = async (
  page: Page,
  path: string,
): Promise<{ status: number; errors: string[] }> => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const resp = await page.goto(`${BASE_URL}${path}`, {
    waitUntil: "domcontentloaded",
  });
  // Let any deferred client error surface.
  await page.waitForLoadState("networkidle").catch(() => {});
  return { status: resp?.status() ?? 0, errors };
};

test.describe("[OHW-056] route-coverage smoke", () => {
  for (const path of ROUTES) {
    test(`route loads: ${path}`, async ({ authenticatedPage: page }) => {
      const { status, errors } = await visit(page, path);
      expect(status, `${path} returned an error status`).toBeLessThan(400);
      expect(errors, `${path} threw an uncaught error on load`).toEqual([]);
    });
  }

  for (const path of EXPECTED_REACHABLE) {
    test(`reachable (no 404): ${path}`, async ({ authenticatedPage: page }) => {
      const { status } = await visit(page, path);
      expect(status, `${path} should resolve, not 404`).toBeLessThan(400);
    });
  }
});
