// tests/cesare-live-diff.spec.ts
//
// [OHW-047d] "Mostra modifiche" paints a green WORD-LEVEL highlight INSIDE the
// real document prose — never a floating overlay panel, never raw HTML.
//
// Spec 47d supersedes the 47b FIX 4 overlay popup: the diff is rendered in
// place over each touched document's body, keyed per documentType. Block markup
// is stripped server-side before diffing so the user only ever sees words.
// "Tutti = tutti": a cross-entity edit highlights every touched document when
// opened. "Nascondi modifiche" clears the highlight.
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

// Personal project owned by test@ohwriters.dev — both its soggetto and sinossi
// (+ a seeded screenplay) have content, so a cross-entity edit yields a real
// diff on each document.
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

test.describe("[OHW-047d] Cesare live-diff — inline green word highlight in the document", () => {
  test("Mostra modifiche highlights words INSIDE the soggetto prose; no overlay panel, no raw HTML; Nascondi clears it", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(120_000);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesare(authenticatedPage);
    // propose_soggetto_v2 — applies a brand-new soggetto LIVE, so the word diff
    // carries both removals (old) and additions (new).
    await sendCesare(
      authenticatedPage,
      "Fammi un v2 del soggetto più asciutto.",
    );

    const trace = authenticatedPage.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });
    await expect(trace).toHaveAttribute("data-state", "idle");

    // No highlight before clicking Mostra.
    await expect(
      authenticatedPage.getByTestId("cesare-live-diff-inline"),
    ).toHaveCount(0);

    const showBtn = trace.getByRole("button", { name: "Mostra modifiche" });
    await expect(showBtn).toBeVisible();
    await showBtn.click();

    // The highlight is the inline layer, and it lives INSIDE the document body
    // (the soggetto editor), NOT as a floating shell-level panel.
    const inline = authenticatedPage.getByTestId("cesare-live-diff-inline");
    await expect(inline).toBeVisible({ timeout: 5_000 });
    await expect(trace).toHaveAttribute("data-state", "showing");
    await expect(authenticatedPage.locator("body")).toHaveAttribute(
      "data-cesare-diff",
      "on",
    );

    // Assert the highlight is nested inside the document editor body.
    const insideEditor = authenticatedPage.locator(
      '[data-testid="subject-editor"] [data-testid="cesare-live-diff-inline"]',
    );
    await expect(insideEditor).toBeVisible();

    // Green additions are present, word-level, in place.
    await expect(inline.locator('[data-diff-op="add"]').first()).toBeVisible({
      timeout: 5_000,
    });

    // The OLD shell-level floating overlay panel is gone.
    await expect(
      authenticatedPage.getByTestId("cesare-live-diff-overlay"),
    ).toHaveCount(0);

    // No raw HTML block markup is ever shown inside the highlight.
    const inlineText = (await inline.innerText()) ?? "";
    expect(inlineText).not.toContain("<p>");
    expect(inlineText).not.toContain("</p>");
    expect(inlineText).not.toMatch(/<\/?[a-z][^>]*>/i);

    // Nascondi modifiche → the highlight clears, back to the previous state.
    const hideBtn = trace.getByRole("button", { name: "Nascondi modifiche" });
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();

    await expect(inline).toHaveCount(0, { timeout: 5_000 });
    await expect(authenticatedPage.locator("body")).not.toHaveAttribute(
      "data-cesare-diff",
      "on",
    );
    await expect(trace).toHaveAttribute("data-state", "idle");
  });

  test("cross-entity edit highlights EACH touched document when opened (tutti = tutti)", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(150_000);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${PERSONAL_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesare(authenticatedPage);
    // One turn touches BOTH soggetto and sinossi → two live-diff markers, keyed
    // per document.
    await sendCesare(authenticatedPage, "Aggiorna soggetto e sinossi.");

    const trace = authenticatedPage.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 120_000 });
    await expect(trace).toHaveAttribute("data-state", "idle");

    await trace.getByRole("button", { name: "Mostra modifiche" }).click();
    await expect(trace).toHaveAttribute("data-state", "showing");

    // Soggetto (the open doc) shows its own highlight.
    const soggettoHighlight = authenticatedPage.locator(
      '[data-testid="subject-editor"] [data-testid="cesare-live-diff-inline"][data-document-type="soggetto"]',
    );
    await expect(soggettoHighlight).toBeVisible({ timeout: 5_000 });

    // SPA-navigate to the sinossi while diff mode is still armed (the live-diff
    // store survives client-side navigation) — its OWN highlight shows. The rail
    // nav item renders as a button with a glyph prefix ("¶Sinossi").
    await authenticatedPage
      .locator("a, button")
      .filter({ hasText: /^[^\w]*Sinossi$/ })
      .first()
      .click();
    await authenticatedPage.waitForURL(/\/synopsis$/, { timeout: 15_000 });

    const sinossiHighlight = authenticatedPage.locator(
      '[data-testid="cesare-live-diff-inline"][data-document-type="synopsis"]',
    );
    await expect(sinossiHighlight).toBeVisible({ timeout: 8_000 });
    await expect(
      sinossiHighlight.locator('[data-diff-op="add"]').first(),
    ).toBeVisible();

    // Still no floating overlay panel anywhere.
    await expect(
      authenticatedPage.getByTestId("cesare-live-diff-overlay"),
    ).toHaveCount(0);
  });
});
