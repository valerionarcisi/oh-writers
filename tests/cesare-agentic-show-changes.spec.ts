import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

/**
 * [Spec 47-A6] "Mostra / Nascondi modifiche" end-to-end (Notion live-doc model).
 *
 * The show/hide-changes control inside a ChangeTrace card branches on HOW Cesare
 * is open:
 *
 *   - FLOATING / expanded → toggling reveals an inline LIVE diff on the open
 *     document (body[data-cesare-diff="on"] + the shell paints a highlight ring
 *     on <main>). "Nascondi modifiche" clears it.
 *   - FULL page → "Mostra modifiche" opens the routed SplitDrawer
 *     (body[data-split-drawer] set) showing the trace's target page with the
 *     diff, because the full panel covers the live document.
 *   - "Annulla" reverts the live document to the version that was current before
 *     Cesare applied the change (the agentic-edit pattern auto-creates a version).
 *
 * Driven from the Soggetto page with the deterministic soggetto-v2 mock
 * scenario ("Marco torna a Falerone…"), which applies live AND renders a
 * ChangeTrace with both "Mostra modifiche" and "Annulla".
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
  test("[OHW-047-A6] floating toggles a live-doc diff; full opens the split drawer; Annulla reverts", async ({
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

    // ── BRANCH 1: FLOATING → inline live diff on the open document ──────────
    await expect(trace).toHaveAttribute("data-state", "idle");
    await expect(body).not.toHaveAttribute("data-cesare-diff", "on");
    // No split drawer in the floating branch.
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/);

    const showBtn = trace.getByRole("button", { name: "Mostra modifiche" });
    await expect(showBtn).toBeVisible();
    await showBtn.click();

    // Live diff highlight + ring (the shell paints inset box-shadow on <main>).
    await expect(body).toHaveAttribute("data-cesare-diff", "on", {
      timeout: 5_000,
    });
    await expect(trace).toHaveAttribute("data-state", "showing");
    const ring = await page
      .locator("#main-content")
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe("none");
    // Floating branch must NOT open the split drawer.
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/);

    // Nascondi modifiche → live diff cleared.
    const hideBtn = trace.getByRole("button", { name: "Nascondi modifiche" });
    await hideBtn.click();
    await expect(body).not.toHaveAttribute("data-cesare-diff", "on", {
      timeout: 5_000,
    });
    await expect(trace).toHaveAttribute("data-state", "idle");

    // ── BRANCH 2: FULL → SplitDrawer with the target page diff ─────────────
    // "Espandi" (the ↗ header control) walks expanded → full; in full the panel
    // covers the doc so "Mostra modifiche" must route to the SplitDrawer.
    await page.getByRole("button", { name: "Espandi", exact: true }).click();
    await expect(body).toHaveAttribute("data-cesare", "full", {
      timeout: 5_000,
    });

    await trace.getByRole("button", { name: "Mostra modifiche" }).click();

    // SplitDrawer opened (body[data-split-drawer] set by the shell) and the
    // live-doc ring is NOT used in this branch.
    await expect(body).toHaveAttribute("data-split-drawer", /open|full/, {
      timeout: 5_000,
    });
    await expect(body).not.toHaveAttribute("data-cesare-diff", "on");
    // The drawer renders the affected target page (Soggetto) with the diff.
    await expect(page.getByTestId("trace-view-soggetto")).toBeVisible({
      timeout: 5_000,
    });

    // Nascondi modifiche → SplitDrawer closes.
    await trace.getByRole("button", { name: "Nascondi modifiche" }).click();
    await expect(body).not.toHaveAttribute("data-split-drawer", /open|full/, {
      timeout: 5_000,
    });

    // ── BRANCH 3: Annulla reverts the live document ────────────────────────
    const annulla = trace.getByRole("button", { name: "Annulla" });
    await expect(annulla).toBeVisible({ timeout: 5_000 });
    await annulla.click();

    // The open editor reverts: the v2 marker is gone (version restored).
    await expect(editor).not.toContainText(SOGGETTO_V2_MARKER, {
      timeout: 15_000,
    });
  });
});
