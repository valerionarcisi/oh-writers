// tests/cesare-start-clean.spec.ts
//
// [Issue #42] Cesare must open CLEAN.
//
// Opening the floating Cesare drawer (or "+ Nuova sessione") must land on the
// empty "Chiedimi qualunque cosa…" cold-start — NOT auto-load the most recent
// session's thread (which used to drop the writer mid-conversation, with a
// leftover pending ask-card). A past session is reachable only by an EXPLICIT
// pick from the sessions list; picking it loads its persisted thread.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  closeCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  resetCesareState,
} from "./helpers/cesare";
import type { Page } from "@playwright/test";

const EMPTY_LANDING_RE = /Chiedimi qualunque cosa/i;

async function gotoSoggetto(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
  await page.waitForLoadState("networkidle");
}

// The cold-start landing: the empty-state lede is visible and no message
// bubbles are rendered (the thread is the empty pending session).
async function expectCleanLanding(page: Page): Promise<void> {
  const drawer = page.getByTestId("cesare-drawer");
  await expect(drawer).toBeVisible({ timeout: 5_000 });
  await expect(drawer.getByText(EMPTY_LANDING_RE)).toBeVisible({
    timeout: 5_000,
  });
  await expect(drawer.getByTestId("cesare-user-bubble")).toHaveCount(0);
}

test.describe("[Issue #42] Cesare opens clean", () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await resetCesareState(page, TEAM_PROJECT_ID);
  });

  test("opening Cesare lands on the empty cold-start, not a stale thread", async ({
    authenticatedPage: page,
  }) => {
    await gotoSoggetto(page);
    await openCesareSheet(page);
    await expectCleanLanding(page);
    await page.screenshot({
      path: "test-results/cesare-start-clean-landing.png",
    });
  });

  test("the worked-on session stays active across a close/reopen in the same mount", async ({
    authenticatedPage: page,
  }) => {
    await gotoSoggetto(page);
    await openCesareSheet(page);

    // Work in a session: this creates + selects a real session and persists its
    // first turn server-side.
    await sendCesareMessage(page, "Ciao Cesare, una prova rapida.");
    await waitForCesareReply(page);
    const drawer = page.getByTestId("cesare-drawer");
    await expect(drawer.getByTestId("cesare-user-bubble")).toHaveCount(1, {
      timeout: 10_000,
    });

    // Closing + reopening the floating drawer does NOT remount the shell, so the
    // session the user is actively working in stays active — the work persists
    // and you return to the same thread, not a fresh one. (Clean-start applies to
    // a FRESH mount / page load, asserted in the reload test below.)
    await closeCesareSheet(page);
    await openCesareSheet(page);
    await expect(
      page.getByTestId("cesare-drawer").getByTestId("cesare-user-bubble"),
    ).toHaveCount(1, { timeout: 10_000 });
  });

  test("after a page reload Cesare opens clean — the worked-on session is reachable, not auto-loaded", async ({
    authenticatedPage: page,
  }) => {
    await gotoSoggetto(page);
    await openCesareSheet(page);

    // Work in a session (persists server-side).
    await sendCesareMessage(page, "Una sessione da ritrovare dopo il reload.");
    await waitForCesareReply(page);
    await expect(
      page.getByTestId("cesare-drawer").getByTestId("cesare-user-bubble"),
    ).toHaveCount(1, { timeout: 10_000 });

    // Reload the page — a FRESH mount. Cesare must NOT auto-load the session we
    // were in: opening it lands on the empty cold-start.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);
    await expectCleanLanding(page);

    // The worked-on session still EXISTS (persisted) and is reachable from the
    // sessions list.
    await page
      .getByTestId("cesare-drawer")
      .getByTestId("cesare-session-selector")
      .click();
    const popover = page.getByTestId("cesare-sessions-popover");
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(popover.getByTestId("cesare-session-row").first()).toBeVisible(
      { timeout: 5_000 },
    );
  });

  test('"+ Nuova" creates a fresh empty session, never the previous thread', async ({
    authenticatedPage: page,
  }) => {
    await gotoSoggetto(page);
    await openCesareSheet(page);

    // Seed one past session.
    await sendCesareMessage(page, "Prima sessione di lavoro.");
    await waitForCesareReply(page);

    // Open the popover and start a brand-new session.
    await page
      .getByTestId("cesare-drawer")
      .getByTestId("cesare-session-selector")
      .click();
    await page.getByTestId("cesare-sessions-popover").waitFor({
      state: "visible",
      timeout: 5_000,
    });
    await page.getByTestId("cesare-session-new-btn").click();

    // The new session is empty: cold-start landing, zero bubbles.
    await expectCleanLanding(page);
  });

  test("explicitly picking a past session loads its persisted thread", async ({
    authenticatedPage: page,
  }) => {
    await gotoSoggetto(page);
    await openCesareSheet(page);

    // Create a session with a distinctive first message.
    const firstMessage = "Domanda da ritrovare più tardi.";
    await sendCesareMessage(page, firstMessage);
    await waitForCesareReply(page);

    // Capture the session id from the popover.
    await page
      .getByTestId("cesare-drawer")
      .getByTestId("cesare-session-selector")
      .click();
    const popover = page.getByTestId("cesare-sessions-popover");
    await expect(popover).toBeVisible({ timeout: 5_000 });
    const pastRow = popover.getByTestId("cesare-session-row").first();
    const pastSessionId = await pastRow.getAttribute("data-session-id");
    expect(pastSessionId).toBeTruthy();
    // Close popover, start a fresh empty session via "+ Nuova".
    await page.getByTestId("cesare-session-new-btn").click();
    await expectCleanLanding(page);

    // Now explicitly pick the past session — its persisted thread loads.
    await page
      .getByTestId("cesare-drawer")
      .getByTestId("cesare-session-selector")
      .click();
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await popover.locator(`[data-session-id="${pastSessionId}"]`).click();

    const drawer = page.getByTestId("cesare-drawer");
    await expect(drawer.getByTestId("cesare-user-bubble")).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(
      drawer.getByTestId("cesare-user-bubble").first(),
    ).toContainText(firstMessage);
  });
});
