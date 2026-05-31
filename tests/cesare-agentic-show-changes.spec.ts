import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { resetCesareState } from "./helpers/cesare";

/**
 * [Spec 47-A6 / 47e] "Mostra / Nascondi modifiche" end-to-end.
 *
 * The show/hide-changes control inside a ChangeTrace card branches on HOW Cesare
 * is open:
 *
 *   - FLOATING / expanded → "Mostra modifiche" flashes a TRANSIENT green diff
 *     INSIDE the open document, then it fades (Spec 47e). "Nascondi modifiche"
 *     flashes the red previous text, then fades — neither reverts; the document
 *     always keeps the new version.
 *   - FULL page → "Mostra modifiche" opens the routed SplitDrawer
 *     (body[data-split-drawer] set) showing the trace's target page with the
 *     diff, because the full panel covers the live document.
 *   - There is NO inline "Annulla" (Spec 47e removed it; rollback lives in the
 *     Versions SplitDrawer).
 *
 * Driven from the Soggetto page with the deterministic soggetto-v2 mock
 * scenario ("Marco torna a Falerone…"), which applies live AND renders a
 * ChangeTrace with "Mostra modifiche".
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

  test("[OHW-047-A6/047e] floating flashes a transient diff; full opens the split drawer; no Annulla", async ({
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

    // Spec 47e: no inline "Annulla" affordance (rollback lives in Versions).
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);

    // ── BRANCH 1: FLOATING → transient inline flash on the open document ────
    await expect(trace).toHaveAttribute("data-state", "idle");
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/);

    const showBtn = trace.getByRole("button", { name: "Mostra modifiche" });
    await expect(showBtn).toBeVisible();
    await showBtn.click();

    // Green flash appears INSIDE the document, then FADES OUT.
    const flash = page.getByTestId("cesare-live-diff-inline");
    await expect(flash).toBeVisible({ timeout: 5_000 });
    await expect(flash).toHaveAttribute("data-flash-mode", "mostra");
    await expect(trace).toHaveAttribute("data-state", "showing");
    // Floating branch must NOT open the split drawer.
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/);
    await expect(flash).toHaveCount(0, { timeout: 6_000 });

    // Nascondi → red previous-text flash, then fades. The doc keeps the v2.
    await trace.getByRole("button", { name: "Nascondi modifiche" }).click();
    const peek = page.getByTestId("cesare-live-diff-inline");
    await expect(peek).toBeVisible({ timeout: 5_000 });
    await expect(peek).toHaveAttribute("data-flash-mode", "nascondi");
    await expect(peek).toHaveCount(0, { timeout: 6_000 });
    await expect(trace).toHaveAttribute("data-state", "idle");
    await expect(editor).toContainText(SOGGETTO_V2_MARKER);

    // ── BRANCH 2: FULL → SplitDrawer with the target page diff ─────────────
    // "Espandi" (the ↗ header control) walks expanded → full; in full the panel
    // covers the doc so "Mostra modifiche" must route to the SplitDrawer.
    await page.getByRole("button", { name: "Espandi", exact: true }).click();
    await expect(body).toHaveAttribute("data-cesare", "full", {
      timeout: 5_000,
    });

    await trace.getByRole("button", { name: "Mostra modifiche" }).click();

    // SplitDrawer opened (body[data-split-drawer] set by the shell).
    await expect(body).toHaveAttribute("data-split-drawer", /open|full/, {
      timeout: 5_000,
    });
    // The drawer renders the affected target page (Soggetto) with the diff.
    await expect(page.getByTestId("trace-view-soggetto")).toBeVisible({
      timeout: 5_000,
    });

    // Nascondi modifiche → SplitDrawer closes.
    await trace.getByRole("button", { name: "Nascondi modifiche" }).click();
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/, {
      timeout: 5_000,
    });

    // The document still holds the v2 — nothing in this flow reverts it.
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
    await expect(
      page.getByRole("button", { name: "Mostra modifiche" }),
    ).toHaveCount(0);
    // No flash was armed and no split opened.
    await expect(page.getByTestId("cesare-live-diff-inline")).toHaveCount(0);
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/);
  });
});
