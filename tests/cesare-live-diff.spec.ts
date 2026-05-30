// tests/cesare-live-diff.spec.ts
//
// [OHW-047e] "Mostra / Nascondi modifiche" is a TRANSIENT FLASH highlight, not a
// persistent overlay and not a revert. Supersedes 47d/47b.
//
// The edit is ALWAYS applied — the document always holds the new version.
//   - "Mostra modifiche"   → flash GREEN additions INSIDE the document prose,
//                            then it FADES OUT. The document stays on the new
//                            version.
//   - "Nascondi modifiche" → flash RED previous text (what was removed), then it
//                            FADES OUT. The document STILL holds the new version
//                            — Nascondi is a peek at "how it was", not a revert.
//   - There is NO inline "Annulla" button (true rollback lives in Versions).
//   - Re-modelling the highlight as a fire-and-forget flash also removes the
//     47d "Maximum update depth exceeded" loop — asserted here as a regression.
import { test, expect } from "./fixtures";
import type { ConsoleMessage, Page } from "@playwright/test";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

// Personal project owned by test@ohwriters.dev — both its soggetto and sinossi
// have content, so a cross-entity edit yields a real diff on each document.
const PERSONAL_PROJECT_ID = "00000000-0000-4000-a000-000000000010";

async function openCesare(page: Page): Promise<void> {
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

/** Collect "Maximum update depth exceeded" console errors for the lifetime of
 *  the test, so we can assert the 47d render loop is gone. */
function trackUpdateDepthErrors(page: Page): { count: () => number } {
  let n = 0;
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() === "error" && m.text().includes("Maximum update depth")) n++;
  };
  page.on("console", onConsole);
  return { count: () => n };
}

test.describe("[OHW-047e] Cesare modifiche — transient flash highlight (green/red, fades), no Annulla, no update-depth loop", () => {
  test("Mostra flashes green then fades; Nascondi flashes red previous text then fades; doc keeps the new version; no Annulla; no update-depth error", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(120_000);
    const loop = trackUpdateDepthErrors(authenticatedPage);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesare(authenticatedPage);
    await sendCesare(
      authenticatedPage,
      "Fammi un v2 del soggetto più asciutto.",
    );

    const trace = authenticatedPage.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });

    // The edit is already applied: the deterministic v2 marker is in the doc.
    const editor = authenticatedPage.getByTestId("subject-editor");
    const appliedMarker = "Marco torna a Falerone";
    await expect(editor).toContainText(appliedMarker, { timeout: 15_000 });

    // The inline "Annulla" affordance is GONE from the trace card.
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);

    // No highlight before clicking Mostra.
    await expect(
      authenticatedPage.getByTestId("cesare-live-diff-inline"),
    ).toHaveCount(0);

    // ── Mostra → GREEN additions appear INSIDE the document, then FADE OUT ────
    await trace.getByRole("button", { name: "Mostra modifiche" }).click();

    const flash = authenticatedPage.getByTestId("cesare-live-diff-inline");
    await expect(flash).toBeVisible({ timeout: 5_000 });
    await expect(flash).toHaveAttribute("data-flash-mode", "mostra");
    // Nested inside the document editor body (not a shell-level panel).
    await expect(
      authenticatedPage.locator(
        '[data-testid="subject-editor"] [data-testid="cesare-live-diff-inline"]',
      ),
    ).toBeVisible();
    await expect(flash.locator('[data-diff-op="add"]').first()).toBeVisible();
    // No raw HTML markup is ever shown.
    const flashText = (await flash.innerText()) ?? "";
    expect(flashText).not.toMatch(/<\/?[a-z][^>]*>/i);

    // It is transient: it disappears after the fade window.
    await expect(flash).toHaveCount(0, { timeout: 6_000 });

    // ── Nascondi → RED previous text flashes, then FADES; doc unchanged ───────
    await trace.getByRole("button", { name: "Nascondi modifiche" }).click();

    const peek = authenticatedPage.getByTestId("cesare-live-diff-inline");
    await expect(peek).toBeVisible({ timeout: 5_000 });
    await expect(peek).toHaveAttribute("data-flash-mode", "nascondi");
    await expect(peek.locator('[data-diff-op="del"]').first()).toBeVisible();
    await expect(peek).toHaveCount(0, { timeout: 6_000 });

    // The document STILL holds the new version — Nascondi did not revert.
    await expect(editor).toContainText(appliedMarker, { timeout: 5_000 });

    // Re-click Mostra → green flash again (toggleable).
    await trace.getByRole("button", { name: "Mostra modifiche" }).click();
    const reflash = authenticatedPage.getByTestId("cesare-live-diff-inline");
    await expect(reflash).toBeVisible({ timeout: 5_000 });
    await expect(reflash).toHaveAttribute("data-flash-mode", "mostra");

    // Regression: NO "Maximum update depth exceeded" anywhere in the flow.
    expect(loop.count()).toBe(0);
  });

  test("cross-doc: opening another touched document flashes ITS diff", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(150_000);
    const loop = trackUpdateDepthErrors(authenticatedPage);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${PERSONAL_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesare(authenticatedPage);
    // One turn touches BOTH soggetto and sinossi → two live-diff markers.
    await sendCesare(authenticatedPage, "Aggiorna soggetto e sinossi.");

    const trace = authenticatedPage.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 120_000 });

    // Mostra → soggetto (the open doc) flashes its own green diff.
    await trace.getByRole("button", { name: "Mostra modifiche" }).click();
    await expect(
      authenticatedPage.locator(
        '[data-testid="subject-editor"] [data-testid="cesare-live-diff-inline"][data-document-type="soggetto"]',
      ),
    ).toBeVisible({ timeout: 5_000 });

    // SPA-navigate to the sinossi. The flash store carries the latest request
    // per document (last-value replay), so the sinossi's own flash fires when
    // its CesareLiveDiff mounts — without re-clicking Mostra.
    await authenticatedPage
      .locator("a, button")
      .filter({ hasText: /^[^\w]*Sinossi$/ })
      .first()
      .click();
    await authenticatedPage.waitForURL(/\/synopsis$/, { timeout: 15_000 });

    await expect(
      authenticatedPage.locator(
        '[data-testid="cesare-live-diff-inline"][data-document-type="synopsis"]',
      ),
    ).toBeVisible({ timeout: 8_000 });

    expect(loop.count()).toBe(0);
  });
});
