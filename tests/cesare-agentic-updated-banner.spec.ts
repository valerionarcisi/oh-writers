// tests/cesare-agentic-updated-banner.spec.ts
//
// [OHW-063] Entity-page Cesare-updated card stack.
//
// Spec 63: when the writer is ON the page Cesare just edited, the change is shown
// by an in-editor card — never the SplitDrawer (which would duplicate the document
// the writer is already reading). One card per Cesare turn; multiple turns stack
// collapsed with a "N modifiche" counter + ‹ › nav. "↩ Annulla" restores the
// pre-turn version; "Ho visto"/× dismisses the card.
//
// We drive deterministic mock soggetto edits and assert the card surfaces, the
// stack counter grows across turns, navigation moves between cards, and Annulla
// removes a card.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  closeCesareSheet,
  sendCesareWithRetry,
  resetCesareState,
} from "./helpers/cesare";

const MOCK_V2_MARKER = "Marco torna a Falerone";

// Send one Cesare edit on the already-open chat. The caller opens the drawer
// once and closes it at the end (reopening between turns races the dock pill).
async function sendSoggettoEdit(page: import("@playwright/test").Page) {
  const reply = await sendCesareWithRetry(
    page,
    "Fammi un v2 del soggetto più asciutto.",
  );
  expect(reply.toLowerCase()).toMatch(/soggetto|aggiornat|applicat/);
}

test.describe("[OHW-063] Cesare-updated card stack on the entity page", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("a Cesare edit surfaces the in-editor card (never the split)", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("rich-text-editor")).toBeVisible({
      timeout: 15_000,
    });

    await openCesareSheet(page);
    await sendSoggettoEdit(page);
    await closeCesareSheet(page);

    const banner = page.getByTestId("cesare-updated-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveAttribute("data-document-type", "soggetto");
    // The applied text lands live in the editor (the live-doc contract holds).
    await expect(page.getByTestId("rich-text-editor")).toContainText(
      MOCK_V2_MARKER,
      { timeout: 15_000 },
    );
    // A single turn shows no stack toggle.
    await expect(page.getByTestId("cesare-updated-stack-toggle")).toHaveCount(
      0,
    );

    // "Mostra cosa è cambiato" underlines the changed text INSIDE the document
    // prose (a decoration on the real text), never an overlay and never the
    // split. The split lane must stay absent on the entity page.
    await page.getByTestId("cesare-updated-see").click();
    await expect(page.locator(".cesare-change-underline").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("versions-split-lane")).toHaveCount(0);
    await expect(page.getByTestId("cesare-peek-lane")).toHaveCount(0);

    // Toggle off removes the underline.
    await page.getByTestId("cesare-updated-see").click();
    await expect(page.locator(".cesare-change-underline")).toHaveCount(0);
  });

  test("the chat result card hides 'Mostra modifiche' when the editor is in front", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("rich-text-editor")).toBeVisible({
      timeout: 15_000,
    });

    await openCesareSheet(page);
    await sendSoggettoEdit(page);

    // The result card appears in the floating chat, but its "Mostra modifiche"
    // is suppressed here — the in-editor banner owns the highlight (no duplicate).
    await expect(page.getByTestId("cesare-change-trace")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-show-changes-btn")).toHaveCount(0);
  });

  test("two turns stack: counter collapses, click expands the inline list", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(160_000);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("rich-text-editor")).toBeVisible({
      timeout: 15_000,
    });

    await openCesareSheet(page);
    await sendSoggettoEdit(page);
    await expect(page.getByTestId("cesare-updated-banner")).toBeVisible({
      timeout: 15_000,
    });
    await sendSoggettoEdit(page);
    await closeCesareSheet(page);

    // Collapsed: a "2 modifiche" header, the list hidden.
    const toggle = page.getByTestId("cesare-updated-stack-toggle");
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("cesare-updated-count")).toContainText("2");
    await expect(page.getByTestId("cesare-updated-list")).toHaveCount(0);

    // Click expands the inline list with one card per turn.
    await toggle.click();
    const list = page.getByTestId("cesare-updated-list");
    await expect(list).toBeVisible();
    await expect(list.getByTestId("cesare-updated-see")).toHaveCount(2);
  });

  test("↩ Indietro restores the pre-turn text and dismisses the card", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    const editor = page.getByTestId("rich-text-editor");
    await expect(editor).toBeVisible({ timeout: 15_000 });

    await openCesareSheet(page);
    await sendSoggettoEdit(page);
    await closeCesareSheet(page);
    const banner = page.getByTestId("cesare-updated-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    // The edit is applied: the v2 marker is in the editor.
    await expect(editor).toContainText(MOCK_V2_MARKER, { timeout: 15_000 });

    // "Indietro" restores the pre-turn version (real revert) AND closes the card.
    const undo = page.getByTestId("cesare-updated-undo");
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(banner).toHaveCount(0, { timeout: 15_000 });
    // The document reverted: the v2 marker is gone.
    await expect(editor).not.toContainText(MOCK_V2_MARKER, { timeout: 15_000 });
  });
});
