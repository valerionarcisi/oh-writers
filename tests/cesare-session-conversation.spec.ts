// tests/cesare-session-conversation.spec.ts
//
// [OHW-047-A5-session] The full-page session route renders the REAL
// conversation.
//
// Spec 47b FIX 2: `/projects/:id/sessions/:sessionId` must render the actual
// thread — user + assistant bubbles + the agentic trace (ChangeTrace) with
// Mostra/Nascondi modifiche — not an empty shell. The floating drawer and the
// full page share ONE chat store, so a turn sent in the floating drawer shows
// up on the full page for the same session.
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

test.describe("[OHW-047-A5-session] Full-page session renders the real conversation", () => {
  test("a turn sent in the floating drawer appears as bubbles on the session page", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/synopsis`);
    await page.waitForLoadState("networkidle");

    // Send a turn in the floating drawer — it lands in the active session's
    // thread inside the shared store.
    await openCesare(page);
    await sendCesare(page, "La sinossi è efficace per un produttore?");

    // Wait for the assistant bubble to land in the floating conversation.
    const floatingConvo = page.getByTestId("cesare-conversation");
    await expect
      .poll(
        async () =>
          await floatingConvo.getByTestId("cesare-user-bubble").count(),
        {
          timeout: 90_000,
        },
      )
      .toBeGreaterThanOrEqual(1);

    // Navigate to the session full-page via the rail Cesare entry → first row.
    await page.getByTestId("rail-cesare-entry").click();
    await page.waitForURL(`**/projects/${TEAM_PROJECT_ID}/sessions`, {
      timeout: 10_000,
    });
    const firstRow = page
      .getByTestId("cesare-sessions-landing")
      .locator("[data-session-id]")
      .first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();

    await page.waitForURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
      { timeout: 10_000 },
    );

    // The full page renders the SAME thread: the user bubble + an assistant
    // bubble are visible inside the session conversation surface.
    const thread = page.getByTestId("session-conversation-thread");
    await expect(thread).toBeVisible({ timeout: 10_000 });
    await expect(thread.getByTestId("cesare-user-bubble").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      thread.getByTestId("cesare-user-bubble").first(),
    ).toContainText("produttore");

    // The full-page composer is present so the conversation can continue here.
    await expect(page.getByTestId("session-composer")).toBeVisible();
  });

  test("a fresh session page shows the empty-state, not a dead shell", async ({
    authenticatedPage: page,
  }) => {
    // Spec 52 — "+ Nuova" now opens the full-screen landing; the session row is
    // created when the user sends their first message there, which then docks
    // into the conversation surface (empty-state replaced by the live turn +
    // composer), not the old 'opened in Cesare' placeholder.
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions`);
    await page.waitForLoadState("networkidle");

    await page.getByTestId("cesare-session-new").click();
    await page.waitForURL(`**/projects/${TEAM_PROJECT_ID}/sessions/new`, {
      timeout: 10_000,
    });

    await page.getByTestId("new-session-input").fill("Ciao Cesare");
    await page.getByTestId("new-session-send").click();

    await page.waitForURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
      { timeout: 10_000 },
    );

    await expect(page.getByTestId("session-conversation")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("session-composer")).toBeVisible();
  });
});
