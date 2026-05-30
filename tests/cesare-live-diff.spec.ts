import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./breakdown/helpers";
import { setMockContext } from "./helpers/cesare";

/**
 * Local Cesare helpers. The shell dock and composer labels changed on this
 * branch (Spec 44 Notion shell: "Apri Cesare" trigger, "Invia messaggio" send),
 * so this spec drives them directly rather than via the legacy shared helpers.
 */
async function openCesare(page: Page): Promise<void> {
  // The dock toggle and the rail sessions header BOTH carry the accessible
  // name "Apri Cesare" (rail entry added by Spec 47-A5). Scope to the bottom
  // dock so we open the floating chat, not the rail sessions header.
  const trigger = page
    .getByTestId("bottom-dock")
    .getByRole("button", { name: "Apri Cesare" });
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();
  await page
    .getByPlaceholder("Chiedi a Cesare…")
    .waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(400);
}

async function sendCesare(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder("Chiedi a Cesare…");
  await input.focus();
  await input.fill(text);
  await expect(input).toHaveValue(text, { timeout: 5_000 });
  const sendBtn = page.getByRole("button", { name: "Invia messaggio" });
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.click();
}

async function waitForReply(page: Page): Promise<void> {
  // The conversation lives in [data-testid="cesare-conversation"]; an assistant
  // reply pushes a second <p> (user bubble + assistant markdown). We poll the
  // conversation paragraph count rather than the role=log a11y name, which is
  // immune to ARIA-tree timing on the slide-in drawer.
  const convo = page.getByTestId("cesare-conversation");
  await expect
    .poll(async () => await convo.locator("p").count(), { timeout: 90_000 })
    .toBeGreaterThanOrEqual(2);
}

/**
 * [Spec 44] Cesare ChangeTrace — "Mostra modifiche" live-doc diff toggle
 *
 * Canonical Notion model: Cesare edits already landed on the open document.
 * The "Mostra modifiche" control in the ChangeTrace result card must reveal a
 * visible diff highlight on the live page (body[data-cesare-diff="on"] +
 * ChangeTrace data-state="showing"), and "Nascondi modifiche" must remove it.
 *
 * Regression for the iter-1 BLOCKER (E7): the button only toggled its own
 * label and produced no visible state change.
 *
 * Driven from the Breakdown page (well-seeded TEAM_PROJECT_ID) using the
 * estimate_scene_cost scenario, which emits a step block — so the ChangeTrace
 * card renders — while keeping the Cesare drawer expanded.
 */
test.describe("[Spec 44] Cesare live-doc diff toggle", () => {
  test("[OHW-044-diff] Mostra/Nascondi modifiche drives a visible live-doc diff state", async ({
    authenticatedPage,
  }) => {
    // The mock LLM tool-loop round-trip can take 20-40s on a cold dev cache.
    test.setTimeout(120_000);
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await authenticatedPage.waitForLoadState("networkidle");

    await setMockContext(authenticatedPage, { SCENE_NUMBER: 1 });

    await openCesare(authenticatedPage);
    await sendCesare(authenticatedPage, "Stima il costo della scena 1.");
    await waitForReply(authenticatedPage);

    // The ChangeTrace result card must render.
    const trace = authenticatedPage.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 20_000 });

    // Initial state: no live diff highlight, trace idle.
    await expect(trace).toHaveAttribute("data-state", "idle");
    await expect(authenticatedPage.locator("body")).not.toHaveAttribute(
      "data-cesare-diff",
      "on",
    );

    // Click "Mostra modifiche" → live diff highlight appears.
    const showBtn = trace.getByRole("button", { name: "Mostra modifiche" });
    await expect(showBtn).toBeVisible();
    await showBtn.click();

    await expect(authenticatedPage.locator("body")).toHaveAttribute(
      "data-cesare-diff",
      "on",
      { timeout: 5_000 },
    );
    await expect(trace).toHaveAttribute("data-state", "showing");

    // The toggle now reads "Nascondi modifiche".
    const hideBtn = trace.getByRole("button", { name: "Nascondi modifiche" });
    await expect(hideBtn).toBeVisible();

    // Click "Nascondi modifiche" → live diff highlight is removed.
    await hideBtn.click();

    await expect(authenticatedPage.locator("body")).not.toHaveAttribute(
      "data-cesare-diff",
      "on",
      { timeout: 5_000 },
    );
    await expect(trace).toHaveAttribute("data-state", "idle");
    await expect(
      trace.getByRole("button", { name: "Mostra modifiche" }),
    ).toBeVisible();
  });
});
