// tests/cesare-history-markdown.spec.ts
//
// [OHW-051] Cesare history as derived markdown.
//
// Step 1 (the headline gap): a session's conversation is PERSISTED, so it
// survives a full page reload — both a plain turn and an agentic edit turn (with
// its trace) come back. Step 2/3 (per-edit changelog + per-session transcript
// markdown) are DERIVED on read from the persisted messages + document_versions;
// they are exhaustively covered by the pure-builder unit tests
// (packages/domain/src/cesare-history/*.test.ts, including the regenerability
// proof). Here we prove the end-to-end persistence the derivation depends on.
import { type Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
} from "./helpers/cesare";

// Cesare's open/closed state persists across reloads (localStorage), so after a
// reload the floating drawer may ALREADY be open — in which case the BottomDock
// "Apri Cesare" pill is not rendered. Open only when the composer is not visible.
async function ensureCesareOpen(page: Page): Promise<void> {
  const composer = page.getByPlaceholder("Chiedi a Cesare…");
  if (await composer.isVisible().catch(() => false)) return;
  await openCesareSheet(page);
}

test.describe("[OHW-051] Cesare history — derived markdown", () => {
  test("a session's conversation survives a full reload", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");

    await ensureCesareOpen(page);

    const probe = `Domanda di prova OHW051 ${Date.now()}`;
    await sendCesareMessage(page, probe);
    await waitForCesareReply(page);

    // The user bubble is visible before reload.
    await expect(
      page.getByTestId("cesare-conversation").getByText(probe),
    ).toBeVisible({ timeout: 10_000 });

    // Full reload: the in-memory reducer is wiped — only persistence can bring
    // the conversation back.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await ensureCesareOpen(page);

    // The persisted user message is re-hydrated into the thread.
    await expect(
      page.getByTestId("cesare-conversation").getByText(probe),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("an agentic edit turn (with its trace) survives a reload", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);
    await page.waitForLoadState("networkidle");

    await ensureCesareOpen(page);
    await sendCesareMessage(
      page,
      "Riscrivi il soggetto rendendolo più intenso",
    );
    const reply = await waitForCesareReply(page);
    // MOCK_AI applies a soggetto edit and reports the new version.
    expect(reply.toLowerCase()).toMatch(/aggiornato|soggetto|versione/i);

    const conversation = page.getByTestId("cesare-conversation");
    // The agentic-edit trace renders the "Aggiornato Soggetto" step + a
    // Mostra modifiche affordance — the persisted edit marker is what the
    // changelog markdown derives from.
    await expect(conversation.getByTestId("cesare-show-changes-btn")).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await page.waitForLoadState("networkidle");
    await ensureCesareOpen(page);

    // After reload the edit turn — including its trace + the Mostra modifiche
    // control — is restored from the persisted message metadata.
    const conversationAfter = page.getByTestId("cesare-conversation");
    await expect(
      conversationAfter.getByText(
        "Riscrivi il soggetto rendendolo più intenso",
      ),
    ).toBeVisible({ timeout: 15_000 });
    await expect(conversationAfter.getByTestId("cesare-show-changes-btn")).toBeVisible({
      timeout: 15_000,
    });
  });
});
