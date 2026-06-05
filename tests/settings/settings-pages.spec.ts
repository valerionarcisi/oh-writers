// tests/settings/settings-pages.spec.ts
//
// [Spec 58 — Settings pages polish] Narrative Walk N-23 + N-24.
//
//   N-23 — the account settings page is comfortably wide (not a cramped 640px
//          single column) on a wide viewport, and its section grid collapses to
//          a single column on a narrow viewport.
//   N-24 — the rail project header is an honest menu: its chevron-down opens a
//          project menu, and "Impostazioni progetto" lands on project settings.
import { test, expect } from "../fixtures";
import { BASE_URL } from "../fixtures";
import { TEAM_PROJECT_ID } from "../soggetto/helpers";

test.describe("[Spec 58] settings pages polish", () => {
  // ── N-23 — account settings is comfortably wide, container-driven ──
  test("N-23 — account settings uses a wide layout (well beyond the old 640px)", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForURL("**/settings", { timeout: 15_000 });
    await expect(page.getByTestId("profile-name-input")).toBeVisible({
      timeout: 10_000,
    });

    // All four sections mount async (Password/Teams resolve their queries),
    // so wait for the password section before measuring the settled layout.
    await expect(page.getByTestId("current-password-input")).toBeVisible({
      timeout: 10_000,
    });

    // The page content box must be comfortably wide on a wide viewport — the
    // old layout capped it at 640px. We assert it is clearly past that cap.
    const pageBox = await page
      .getByTestId("user-settings-page")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(pageBox).toBeGreaterThan(900);

    // Two-up grid at this width: the section cards sit side by side, so at
    // least two sections share the same top offset (same row). Poll so the
    // assertion sees the settled grid layout rather than an intermediate frame.
    await expect
      .poll(
        async () => {
          const tops = await page
            .getByTestId("user-settings-grid")
            .locator("> section")
            .evaluateAll((nodes) =>
              nodes.map((n) => Math.round(n.getBoundingClientRect().top)),
            );
          // A duplicate top => two cards share a row (two-column layout).
          return tops.some((t, i) => tops.indexOf(t) !== i);
        },
        { timeout: 10_000 },
      )
      .toBe(true);
  });

  test("N-23 — section grid collapses to a single column on a narrow viewport", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForURL("**/settings", { timeout: 15_000 });
    await expect(page.getByTestId("profile-name-input")).toBeVisible({
      timeout: 10_000,
    });

    // Single column: every section starts at (about) the same left edge and no
    // two share a row (each top is unique).
    const rects = await page
      .getByTestId("user-settings-grid")
      .locator("> section")
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { top: Math.round(r.top), left: Math.round(r.left) };
        }),
      );
    const lefts = rects.map((r) => r.left);
    const tops = rects.map((r) => r.top);
    expect(new Set(lefts).size).toBe(1); // all aligned to one column
    expect(new Set(tops).size).toBe(tops.length); // no two on the same row
  });

  // ── N-24 — the rail project header opens a project menu ──
  test("N-24 — project header chevron opens a menu; 'Impostazioni progetto' opens project settings", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await expect(page.getByTestId("topbar-account")).toBeVisible({
      timeout: 15_000,
    });
    // Wait for the shell to hydrate (the rail grid only lays out once
    // `body[data-shell]` is set); clicking before that races the pre-hydration
    // frame where the rail trigger isn't yet interactive.
    await expect
      .poll(
        () => page.evaluate(() => document.body.getAttribute("data-shell")),
        { timeout: 10_000 },
      )
      .not.toBeNull();

    // The project header is a menu trigger (the chevron-down promises a menu).
    const trigger = page.getByTestId("rail-project-menu-trigger");
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    // The menu opens with the project actions.
    await expect(page.getByTestId("rail-project-menu")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("project-menu-open")).toBeVisible();
    await expect(page.getByTestId("project-menu-switch")).toBeVisible();

    // "Impostazioni progetto" lands on the project settings route.
    await page.getByTestId("project-menu-settings").click();
    await page.waitForURL(`**/projects/${TEAM_PROJECT_ID}/settings`, {
      timeout: 10_000,
    });
    expect(new URL(page.url()).pathname).toBe(
      `/projects/${TEAM_PROJECT_ID}/settings`,
    );
  });
});
