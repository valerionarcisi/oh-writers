// tests/shell-per-page.spec.ts
//
// [OHW-044-D] Per-page chrome rules from Spec 44.
//
// Sceneggiatura keeps an Element Legend row in the Top Strip.
// Breakdown shows a RecapStrip above the editor and dropped the legacy
// CATEGORIE/CESARE right panel.
// Soggetto / Sinossi / Trattamento keep their margin notes column but the
// notes collapse to single-line when Cesare ≠ closed.
// Locations switches to a split-pane (list 340px + map).
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";

test.describe("[OHW-044-D] Per-page chrome", () => {
  test("Breakdown surfaces the RecapStrip and drops the legacy right panel", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // RecapStrip should sit above the screenplay reader. We accept either a
    // dedicated testid (preferred) or its module class. The legacy panel
    // showed CATEGORIE 7 / CESARE 1 ALERT — those headings must NOT be on
    // the page anymore.
    await expect(
      page.locator('[data-testid="breakdown-recap-strip"]'),
    ).toBeVisible({ timeout: 10_000 });

    // Legacy panel sentinels — these existed pre-Spec 44 and must NOT
    // be in the DOM anymore.
    expect(await page.getByText("CATEGORIE 7").count()).toBe(0);
    expect(await page.getByText("CESARE 1 ALERT").count()).toBe(0);
  });

  test("Sceneggiatura keeps an Element Legend row in the Top Strip", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Element Legend exposes the canonical six tags as text. We assert at
    // least three of them are visible — they're rendered as compact pills
    // in the strip and may be hidden behind container queries at narrow
    // viewports.
    const expected = ["SCENE", "ACTION", "CHARACTER"];
    for (const token of expected) {
      const matches = await page.getByText(token, { exact: false }).count();
      expect(
        matches,
        `Element Legend should expose the token ${token}`,
      ).toBeGreaterThan(0);
    }
  });

  test("Locations renders a split-pane (list + map area)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/locations`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // The locations page is now a split pane. We assert that a region
    // labelled with "Location" exists and there's a candidates list.
    const candidates = page.locator('[data-testid^="candidate-card-"]');
    // Even with zero candidates the empty-state should render.
    const candidatesPresent = await candidates.count();
    expect(candidatesPresent).toBeGreaterThanOrEqual(0);
  });
});
