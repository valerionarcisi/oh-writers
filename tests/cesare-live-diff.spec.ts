// tests/cesare-live-diff.spec.ts
//
// [OHW-047-A6] Floating "Mostra modifiche" renders a WORD-LEVEL coloured diff.
//
// Spec 47b FIX 4: when Cesare is the floating bottom-right drawer the edited
// document is visible, so "Mostra modifiche" must reveal a real word-level
// coloured diff (green additions / red removals) inline — NOT a generic ring.
// The diff segments are precomputed server-side when an edit is applied live and
// rendered by the <CesareLiveDiff/> overlay.
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

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

test.describe("[OHW-047-A6] Cesare floating live-doc WORD-LEVEL diff", () => {
  test("Mostra modifiche reveals a coloured word-level diff; Nascondi removes it", async ({
    authenticatedPage,
  }) => {
    // The mock LLM tool-loop + a real Haiku section rewrite can take a while.
    test.setTimeout(120_000);

    // Drive from the soggetto page where Cesare applies an edit LIVE to the open
    // document. The `apply_text_edit` scenario is a deterministic find/replace on
    // the seeded soggetto ("traduttrice freelance" → "interprete simultanea"),
    // so the server emits a step block AND a word-diff marker with both removals
    // (red) and additions (green) — no LLM call needed.
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesare(authenticatedPage);
    await sendCesare(
      authenticatedPage,
      "Sostituisci la professione: Marta è una interprete simultanea.",
    );

    // The ChangeTrace result card must render once the edit lands.
    const trace = authenticatedPage.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });
    await expect(trace).toHaveAttribute("data-state", "idle");

    // No diff overlay yet.
    await expect(
      authenticatedPage.getByTestId("cesare-live-diff-overlay"),
    ).toHaveCount(0);

    // Click "Mostra modifiche" → the word-level coloured diff overlay appears.
    const showBtn = trace.getByRole("button", { name: "Mostra modifiche" });
    await expect(showBtn).toBeVisible();
    await showBtn.click();

    const overlay = authenticatedPage.getByTestId("cesare-live-diff-overlay");
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await expect(trace).toHaveAttribute("data-state", "showing");
    // body flag still flips (back-compat wiring).
    await expect(authenticatedPage.locator("body")).toHaveAttribute(
      "data-cesare-diff",
      "on",
    );

    // The overlay shows real coloured word spans: a replace yields BOTH added
    // (green) spans and removed (red) spans, word-level and inline.
    await expect(overlay.locator('[data-diff-op="add"]').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(overlay.locator('[data-diff-op="del"]').first()).toBeVisible({
      timeout: 5_000,
    });
    // The added text ("interprete", "simultanea") is painted green; the removed
    // text ("traduttrice", "freelance") is painted red — word-level, in place.
    await expect(
      overlay.locator('[data-diff-op="add"]', { hasText: "interprete" }),
    ).toBeVisible();
    await expect(
      overlay.locator('[data-diff-op="del"]', { hasText: "traduttrice" }),
    ).toBeVisible();

    // Click "Nascondi modifiche" → the overlay is removed.
    const hideBtn = trace.getByRole("button", { name: "Nascondi modifiche" });
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();

    await expect(overlay).toHaveCount(0, { timeout: 5_000 });
    await expect(authenticatedPage.locator("body")).not.toHaveAttribute(
      "data-cesare-diff",
      "on",
    );
    await expect(trace).toHaveAttribute("data-state", "idle");
  });
});
