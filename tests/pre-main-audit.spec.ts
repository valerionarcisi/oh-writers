// tests/pre-main-audit.spec.ts
//
// Pre-main UI audit regressions:
//   - FIX 2: every audited route has a non-empty, sensible <title> (the audit
//     found document.title empty on every page).
//   - FIX 3: /locations no longer logs a React hydration mismatch ("a tree
//     hydrated but some attributes … didn't match").
//   - FIX 4: the dashboard no longer fires a 500 from `getProjectById` with an
//     empty (non-uuid) projectId before route params resolve.
import { test, expect } from "./fixtures";
import type { ConsoleMessage, Page, Response } from "@playwright/test";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

const ROUTES: ReadonlyArray<{ path: string; expectTitle: string }> = [
  { path: "/dashboard", expectTitle: "Dashboard · Oh Writers" },
  {
    path: `/projects/${TEAM_PROJECT_ID}`,
    expectTitle: "Progetto · Oh Writers",
  },
  {
    path: `/projects/${TEAM_PROJECT_ID}/soggetto`,
    expectTitle: "Soggetto · Oh Writers",
  },
  {
    path: `/projects/${TEAM_PROJECT_ID}/synopsis`,
    expectTitle: "Sinossi · Oh Writers",
  },
  {
    path: `/projects/${TEAM_PROJECT_ID}/outline`,
    expectTitle: "Scaletta · Oh Writers",
  },
  {
    path: `/projects/${TEAM_PROJECT_ID}/treatment`,
    expectTitle: "Trattamento · Oh Writers",
  },
  {
    path: `/projects/${TEAM_PROJECT_ID}/breakdown`,
    expectTitle: "Breakdown · Oh Writers",
  },
  {
    path: `/projects/${TEAM_PROJECT_ID}/budget`,
    expectTitle: "Budget · Oh Writers",
  },
  {
    path: `/projects/${TEAM_PROJECT_ID}/schedule`,
    expectTitle: "Calendario · Oh Writers",
  },
  {
    path: `/projects/${TEAM_PROJECT_ID}/locations`,
    expectTitle: "Location · Oh Writers",
  },
];

function trackHydrationErrors(page: Page): { count: () => number } {
  let n = 0;
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && /tree hydrated|didn't match/i.test(m.text())) {
      n++;
    }
  });
  return { count: () => n };
}

test.describe("[OHW-audit] pre-main UI audit regressions", () => {
  test("every audited route sets a non-empty, sensible document.title", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    for (const { path, expectTitle } of ROUTES) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState("networkidle");
      const title = await page.title();
      expect(title, `title for ${path}`).not.toBe("");
      expect(title, `title for ${path}`).toBe(expectTitle);
    }
  });

  test("/locations logs no hydration mismatch", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60_000);
    const hydration = trackHydrationErrors(page);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/locations`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);
    expect(hydration.count()).toBe(0);
  });

  test("dashboard load fires no uuid-validation 500", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60_000);
    const serverErrors: string[] = [];
    page.on("response", (r: Response) => {
      if (r.status() >= 500) serverErrors.push(r.url());
    });
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_500);
    expect(
      serverErrors.filter((u) => u.includes("getProjectById")),
    ).toHaveLength(0);
  });
});
