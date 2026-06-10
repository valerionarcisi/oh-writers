// tests/cesare-agentic-bell-notifications.spec.ts
//
// [OHW-066] Cesare bell (NotificationCenter) — one notification per turn.
//
// BUG-066: the bell used to flood with duplicated "Cesare sta lavorando…"
// rows and offered no way to reach the document a turn edited. The contract
// under test:
//   - ONE row per Cesare turn: the start row ("sta lavorando") collapses into
//     the completed row ("Cesare ha aggiornato il <doc>") by updating the
//     same notification id — never appending a second row.
//   - An explicit "Vai al <documento>" link ONLY on applied-change rows,
//     navigating to the affected document's route.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  closeCesareSheet,
  sendCesareWithRetry,
  resetCesareState,
  clearMockContext,
} from "./helpers/cesare";

async function sendSoggettoEdit(page: import("@playwright/test").Page) {
  const reply = await sendCesareWithRetry(
    page,
    "Fammi un v2 del soggetto più asciutto.",
  );
  expect(reply.toLowerCase()).toMatch(/soggetto|aggiornat|applicat/);
}

async function openBell(page: import("@playwright/test").Page) {
  await page
    .getByTestId("topbar-account")
    .getByTestId("notifications-btn")
    .click();
  await expect(page.getByTestId("notification-center-drawer")).toBeVisible({
    timeout: 5_000,
  });
}

test.describe("[OHW-066] Cesare bell — one notification per turn", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
    await clearMockContext(authenticatedPage);
  });

  test("two turns yield exactly two settled rows, each with the Vai-al link", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("rich-text-editor")).toBeVisible({
      timeout: 15_000,
    });

    await openCesareSheet(page);
    await sendSoggettoEdit(page);
    await sendSoggettoEdit(page);
    await closeCesareSheet(page);

    await openBell(page);
    const drawer = page.getByTestId("notification-center-drawer");

    // Exactly TWO rows — one per turn, both already collapsed into their
    // final completed state. No lingering "sta lavorando" duplicates.
    const rows = drawer.locator('[data-testid^="notification-row-"]');
    await expect(rows).toHaveCount(2, { timeout: 10_000 });
    await expect(drawer.locator('li[data-status="completed"]')).toHaveCount(2);
    await expect(drawer.locator('li[data-status="in-progress"]')).toHaveCount(
      0,
    );
    await expect(drawer.getByText("Cesare sta lavorando")).toHaveCount(0);
    await expect(
      drawer.getByText("Cesare ha aggiornato il soggetto"),
    ).toHaveCount(2);

    // Applied-change rows carry the explicit "Vai al <documento>" link.
    const goToLinks = drawer.getByTestId("notification-go-to");
    await expect(goToLinks).toHaveCount(2);
    await expect(goToLinks.first()).toContainText("Vai al soggetto");
  });

  test("the Vai-al link navigates to the affected document's page", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("rich-text-editor")).toBeVisible({
      timeout: 15_000,
    });

    await openCesareSheet(page);
    await sendSoggettoEdit(page);
    await closeCesareSheet(page);

    // Move AWAY from the edited document — the scenario from BUGS.md: the
    // change landed on the Soggetto, the user is elsewhere, the bell's link
    // takes them to the affected document.
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/synopsis`);
    await page.waitForLoadState("networkidle");

    await openBell(page);
    const goTo = page
      .getByTestId("notification-center-drawer")
      .getByTestId("notification-go-to")
      .first();
    await expect(goTo).toContainText("Vai al soggetto");
    await goTo.click();

    await expect(page).toHaveURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/soggetto$`),
      { timeout: 10_000 },
    );
    // The drawer closes on navigation (single-surface invariant).
    await expect(page.getByTestId("notification-center-drawer")).toHaveCount(0);
  });
});
