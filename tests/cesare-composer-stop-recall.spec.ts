// tests/cesare-composer-stop-recall.spec.ts
//
// The Cesare drawer's composer has two affordances that must actually work,
// not just render:
//
//   - ⏸ (stop): shown while a turn is in flight, aborts it. Regression —
//     the button rendered and called `composer.onStop`, but no caller ever
//     passed an `onStop`, so clicking it silently did nothing.
//   - ArrowUp on an empty composer: recalls the last sent message for
//     editing/resending (the standard chat-app gesture). Never wired before.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  resetCesareState,
  waitForCesareReply,
} from "./helpers/cesare";

test.describe("Cesare composer — stop button and arrow-up recall", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("⏸ aborts an in-flight turn", async ({ authenticatedPage: page }) => {
    test.setTimeout(60_000);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);

    await sendCesareMessage(
      page,
      "Scrivi un'analisi molto lunga e dettagliata",
    );

    const stopBtn = page.locator('[data-testid="cesare-stop-btn"]');
    await expect(stopBtn).toBeVisible({ timeout: 10_000 });
    await stopBtn.dispatchEvent("click");

    // The stopped turn resolves to a terminated marker in the log rather
    // than a full assistant reply, and the composer flips back to send.
    const log = page.getByTestId("cesare-conversation");
    await expect(log).toContainText(/interrotto/i, { timeout: 10_000 });
    await expect(page.locator('[data-testid="cesare-send-btn"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test("ArrowUp on an empty composer recalls the last sent message", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);

    const message = "Suggerisci un arco del personaggio";
    await sendCesareMessage(page, message);
    // Wait for the turn to fully settle (not just the input to clear) — the
    // composer is disabled mid-stream, and toggling isDisabled re-renders it,
    // which can race a keypress fired too early.
    await waitForCesareReply(page);

    const input = page.getByPlaceholder("Chiedi a Cesare…");
    await expect(input).toHaveValue("", { timeout: 10_000 });
    await input.click();
    await page.keyboard.press("ArrowUp");
    await expect(input).toHaveValue(message, { timeout: 5_000 });
  });

  test("ArrowUp does nothing while the composer already has a draft", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);

    await sendCesareMessage(page, "Come rendere il finale più forte?");

    const input = page.getByPlaceholder("Chiedi a Cesare…");
    await expect(input).toHaveValue("", { timeout: 10_000 });
    await input.focus();
    await input.fill("bozza in corso");
    await input.press("ArrowUp");
    // The gesture is a no-op with content already typed — it must never
    // clobber an in-progress draft.
    await expect(input).toHaveValue("bozza in corso");
  });
});
