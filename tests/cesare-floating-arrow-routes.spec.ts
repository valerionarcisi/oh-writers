// tests/cesare-floating-arrow-routes.spec.ts
//
// [046] Cesare floating drawer — the ↗ affordance routes to the session
// detail page, it does NOT open a floating fullscreen overlay.
//
// Previously the floating drawer's ↗ cycled into an in-place "full" overlay.
// Per the canonical surface model (Spec 46) the session detail lives at a real
// central route `/projects/:id/sessions/:sessionId`; ↗ on BOTH the floating
// drawer and the split lane navigates there and the floating drawer dismisses.
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";

// Open the floating drawer via the dock. The dock toggle drives the drawer's
// `isOpen` through a one-render effect, so we poll the dock click until the
// drawer is actually visible — same cold-start guard as the split-drawer spec.
const openFloatingDrawer = async (page: import("@playwright/test").Page) => {
  const drawer = page.getByTestId("cesare-drawer");
  await expect(async () => {
    await page
      .getByTestId("bottom-dock")
      .getByTestId("cesare-open-btn")
      .click();
    await expect(drawer).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
};

test.describe("[046] Cesare floating ↗ routes to session detail", () => {
  test("↗ navigates to /sessions/:id and dismisses the floating drawer", async ({
    authenticatedPage: page,
  }) => {
    // Mint a Cesare session so the floating drawer has an active session to
    // route to (the seed DB may not carry one for this project). The
    // new-session composer navigates to the freshly-created session route.
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("new-session-input").fill("Ciao Cesare");
    await page.getByTestId("new-session-send").click();
    await page.waitForURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
      { timeout: 15_000 },
    );

    // Now move to a regular page and open the floating drawer there.
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    await openFloatingDrawer(page);

    // Since issue #42 the drawer opens CLEAN — no auto-selected session — so a
    // past conversation becomes the ↗ target only on an EXPLICIT pick, the same
    // affordance the writer uses. Pick the session minted above.
    await page.getByTestId("cesare-session-selector").click();
    await expect(page.getByTestId("cesare-sessions-popover")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("cesare-session-row").first().click();

    // ↗ is the expand button in the drawer header. It must route to the central
    // session detail page (the chat IS the route there), not an overlay. Poll
    // the click — the active-session resolution may lag one render behind the
    // drawer mount, and a no-target click is a harmless no-op.
    await expect(async () => {
      await page.getByTestId("cesare-expand-btn").click();
      expect(new URL(page.url()).pathname).toMatch(
        new RegExp(`^/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
      );
    }).toPass({ timeout: 15_000 });

    // We landed on the real central session route — the conversation renders
    // as a page, not an overlay.
    await expect(page.getByTestId("session-conversation")).toBeVisible({
      timeout: 10_000,
    });
    // The floating drawer is gone — we navigated, we did not overlay.
    await expect(page.getByTestId("cesare-drawer")).toHaveCount(0);
    // No `?peek` lane either — this is a real central route.
    expect(new URL(page.url()).searchParams.get("peek")).toBeNull();
  });

  test("↗ from a CLEAN drawer routes to the new-session page (no dead button)", async ({
    authenticatedPage: page,
  }) => {
    // No session pick: since #42 the drawer opens clean, and ↗ used to be a
    // silent no-op in that state — a dead button in the header. It now routes
    // to the empty thread's full-page equivalent.
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    await openFloatingDrawer(page);

    await expect(async () => {
      await page.getByTestId("cesare-expand-btn").click();
      expect(new URL(page.url()).pathname).toBe(
        `/projects/${TEAM_PROJECT_ID}/sessions/new`,
      );
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId("cesare-drawer")).toHaveCount(0);
  });
});
