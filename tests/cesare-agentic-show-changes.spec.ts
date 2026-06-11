import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { resetCesareState } from "./helpers/cesare";

/**
 * [Spec 62 / ADR-0003] "Mostra / Nascondi modifiche" + no inline editor diff.
 *
 * On the entity's OWN page the Cesare edit applies LIVE and the editor always
 * shows the final text clean — there is NO word-level diff painted inside the
 * prose (ADR-0003). The floating ChangeTrace still offers "Mostra modifiche",
 * but clicking it never decorates the editor; the in-editor `CesareLiveDiff`
 * consumer was removed from every narrative editor.
 *
 * The read-only split-preview ("Vedi modifica") + "Apri <Entity>" buttons live
 * on the CHAT SESSION result card, not the floating drawer — covered by the
 * session-page specs.
 *
 * There is NO inline "Annulla" (rollback lives in the Versions SplitDrawer).
 *
 * Driven from the Soggetto page with the deterministic soggetto-v2 mock
 * scenario ("Marco torna a Falerone…"), which applies live AND renders a
 * ChangeTrace.
 *
 * Lives in the `mock-ui` Playwright project (MOCK_AI=true) via the
 * `cesare-agentic-*.spec.ts` glob.
 */

const SOGGETTO_V2_MARKER = "Marco torna a Falerone";

async function openCesare(page: Page): Promise<void> {
  // The dock's Cesare toggle and the rail's sessions header BOTH carry the
  // accessible name "Apri Cesare" (rail entry added by A5). Scope to the
  // bottom dock so we open the floating chat, not the rail sessions header.
  const trigger = page
    .getByTestId("bottom-dock")
    .getByTestId("cesare-open-btn");
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  // The dock pill's react-aria press can be cancelled by layout settling on
  // heavy routes; retry until the shell reports the drawer open.
  await expect(async () => {
    await trigger.click();
    expect(await page.evaluate(() => document.body.dataset.cesare)).toBe(
      "expanded",
    );
  }).toPass({ timeout: 15_000 });
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
  const sendBtn = page.getByTestId("cesare-send-btn");
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.click();
}

async function sendV2AndWaitForTrace(page: Page) {
  await openCesare(page);
  await sendCesare(page, "Fammi un v2 del soggetto più asciutto.");
  const trace = page.getByTestId("cesare-change-trace");
  await expect(trace).toBeVisible({ timeout: 90_000 });
  return trace;
}

test.describe("[Spec 47-A6] Cesare Mostra/Nascondi modifiche end-to-end", () => {
  // Spec 51 persists the soggetto edit; the mock-ui project runs serially
  // against one shared DB. These tests apply the deterministic soggetto v2 live
  // and assert the change trace + flash render — which only happens when the v2
  // is a genuine change. Restore the seed soggetto + clear sessions before each.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  // BUG-N61 (fixme ×8, Valerio's go 2026-06-11): same suppression assert. N-38.
  test.fixme("[OHW-062] floating: edit applies live; the editor never paints an inline diff; no Annulla", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(150_000);
    const page = authenticatedPage;
    const editor = page.getByTestId("rich-text-editor");
    const body = page.locator("body");

    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");
    await expect(editor).toBeVisible({ timeout: 15_000 });

    // ── Run the live-applying write (soggetto v2) ──────────────────────────
    const trace = await sendV2AndWaitForTrace(page);

    // The edit landed LIVE on the open document (no draft tray).
    await expect(editor).toContainText(SOGGETTO_V2_MARKER, { timeout: 15_000 });
    await expect(page.getByTestId("document-draft-banner")).toHaveCount(0);

    // No inline "Annulla" affordance (rollback lives in Versions).
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);

    // ── ADR-0003: the editor never paints an inline word-level diff ────────
    await expect(trace).toHaveAttribute("data-state", "idle");
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/);
    await expect(page.getByTestId("cesare-live-diff-inline")).toHaveCount(0);

    // Spec 63: on the entity's OWN page the floating result card hides "Mostra
    // modifiche" — the in-editor banner owns the highlight, so the card button
    // would be a duplicate. The card therefore offers no show-changes affordance
    // here (it remains on the routed session surface + cross-page edits).
    await expect(trace.getByTestId("cesare-show-changes-btn")).toHaveCount(0);

    // The banner is the entity-page channel instead.
    await expect(page.getByTestId("cesare-updated-banner")).toBeVisible({
      timeout: 15_000,
    });

    // The document still holds the v2, clean — nothing reverted, nothing painted.
    await expect(editor).toContainText(SOGGETTO_V2_MARKER);
  });

  test("[OHW-047-A6] a chat-only reply (no edit) shows NO Mostra modifiche affordance", async ({
    authenticatedPage,
  }) => {
    // Edge/sad path: "Mostra/Nascondi modifiche" must appear ONLY when an edit
    // actually happened. A plain question that runs no write tool produces a
    // chat reply with no ChangeTrace — so neither the toggle nor Annulla exist,
    // and no live diff is ever armed.
    test.setTimeout(120_000);
    const page = authenticatedPage;
    const body = page.locator("body");

    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");

    await openCesare(page);
    await sendCesare(page, "Il conflitto centrale è chiaro?");

    // A reply lands (chat-only), but there is no change-trace card.
    await expect(page.getByTestId("cesare-conversation")).toBeVisible();
    await expect
      .poll(
        async () =>
          await page.getByTestId("cesare-conversation").locator("p").count(),
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(2);

    await expect(page.getByTestId("cesare-change-trace")).toHaveCount(0);
    await expect(page.getByTestId("cesare-show-changes-btn")).toHaveCount(0);
    // No flash was armed and no split opened.
    await expect(page.getByTestId("cesare-live-diff-inline")).toHaveCount(0);
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/);
  });
});
