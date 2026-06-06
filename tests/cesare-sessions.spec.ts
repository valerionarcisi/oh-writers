// tests/cesare-sessions.spec.ts
//
// [OHW-044-C] Cesare sessions CRUD + cross-page thread persistence.
//
// One project can hold many Cesare sessions; the active session is the one
// whose thread shows in the drawer. Switching sessions hot-swaps the message
// history. Navigation between Sceneggiatura / Breakdown / Budget must NOT
// drop the active session — the selector survives every navigation.
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";
import { openCesareSheet } from "./helpers/cesare";

test.describe("[OHW-044-C] Cesare sessions", () => {
  test("opens the session selector inside the drawer header", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // Open Cesare from the dock
    await openCesareSheet(page);
    const drawer = page.getByTestId("cesare-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // The session selector inside the drawer header. If sessions data hasn't
    // loaded yet, the selector may render with a placeholder — we just check
    // the aria-label is present.
    const selector = drawer.getByTestId("cesare-session-selector");
    await expect(selector).toBeVisible({ timeout: 5_000 });
  });

  test("persists the active session across navigation between pages", async ({
    authenticatedPage: page,
  }) => {
    // Open Cesare on Breakdown
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    await openCesareSheet(page);
    await expect(page.getByTestId("cesare-drawer")).toBeVisible();

    // Snapshot the active session title (from the drawer's session selector)
    const drawer = page.getByTestId("cesare-drawer");
    const selector = drawer.getByTestId("cesare-session-selector");
    await expect(selector).toBeVisible({ timeout: 5_000 });
    const initialTitle = (await selector.textContent()) ?? "";
    expect(initialTitle.length).toBeGreaterThan(0);

    // Navigate to Sceneggiatura via the in-app rail link (client-side SPA nav,
    // exactly as a user would). The Cesare drawer state lives in the AppShell —
    // which sits above the routed Outlet and does NOT remount on navigation — so
    // the open drawer survives the page change. (A full `page.goto` reload is not
    // representative: it tears down the in-memory shell.)
    await page.getByRole("button", { name: "Sceneggiatura" }).first().click();
    await page.waitForURL(/\/screenplay$/, { timeout: 10_000 });
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.cesare))
      .toBe("expanded");
    const drawer2 = page.getByTestId("cesare-drawer");
    await expect(drawer2).toBeVisible({ timeout: 5_000 });
    const titleAfterNav =
      (await drawer2.getByTestId("cesare-session-selector").textContent()) ??
      "";
    expect(
      titleAfterNav,
      "session selector should retain its label across page navigation",
    ).toBe(initialTitle);
  });

  test("closing Cesare and reopening it restores the same session", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    await openCesareSheet(page);
    const drawer = page.getByTestId("cesare-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const initialTitle =
      (await drawer.getByTestId("cesare-session-selector").textContent()) ?? "";

    // Close
    await drawer.getByTestId("cesare-close-btn").click();
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.cesare))
      .toBe("closed");

    // Reopen
    await openCesareSheet(page);
    await expect(page.getByTestId("cesare-drawer")).toBeVisible({
      timeout: 5_000,
    });
    const reopenedTitle =
      (await page
        .getByTestId("cesare-drawer")
        .getByTestId("cesare-session-selector")
        .textContent()) ?? "";
    expect(reopenedTitle).toBe(initialTitle);
  });
});
