// tests/cesare-session-naming.spec.ts
//
// [053] Session naming from the first request + inline rename + delete modal.
//
// 1. A new session's title is derived (Notion-style) from its FIRST user message
//    — capped to ~40 chars on a word boundary, no extra LLM call. A SECOND
//    message never changes it, and a user-renamed title is never auto-overwritten.
// 2. The LeftRail session row exposes an inline rename (…-menu → Rinomina, or
//    double-click): Enter commits (rail + central route update), Esc cancels.
// 3. The …-menu → Elimina opens a confirmation modal (DS Dialog, react-aria);
//    Annulla closes without deleting; Elimina removes the row and navigates away
//    when the deleted session was the open one.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import type { Page } from "@playwright/test";

const DERIVED_TITLE_MAX = 40;

// Create a fresh session by sending a first message on the full-screen landing.
// Returns the session id from the resulting central route URL.
async function createSessionFromFirstMessage(
  page: Page,
  firstMessage: string,
): Promise<string> {
  await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("cesare-new-session-landing")).toBeVisible({
    timeout: 15_000,
  });
  const input = page.getByTestId("new-session-input");
  await input.click();
  await input.fill(firstMessage);
  // The send button is disabled until the controlled input registers a value;
  // wait for it to enable so the click lands on an active target.
  const send = page.getByTestId("new-session-send");
  await expect(send).toBeEnabled({ timeout: 10_000 });
  await send.click();
  await page.waitForURL(
    new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/[0-9a-f-]+$`),
    { timeout: 15_000 },
  );
  const url = page.url();
  return url.slice(url.lastIndexOf("/") + 1);
}

// The rail row for a given session id (the wrapper that carries the … menu).
function railRow(page: Page, sessionId: string) {
  return page.locator(
    `[data-rail-section="sessions"] [data-session-id="${sessionId}"]`,
  );
}

// The session title as the rail exposes it (the activate button's accessible
// name is `Sessione Cesare: <title>`). Reading the aria-label avoids depending
// on the hashed CSS-module class of the inner label span.
async function railTitleText(page: Page, sessionId: string): Promise<string> {
  const label =
    (await railRow(page, sessionId)
      .locator("[data-session-button]")
      .first()
      .getAttribute("aria-label")) ?? "";
  return label.replace(/^Sessione Cesare:\s*/, "").trim();
}

test.describe("[053] Session naming + inline rename + delete", () => {
  test("first message derives the title (≤ ~40 chars); a second message does not change it", async ({
    authenticatedPage: page,
  }) => {
    const sessionId = await createSessionFromFirstMessage(
      page,
      "Aggiungi tre film di riferimento al soggetto",
    );

    // The rail picks up the derived title once the first turn persists.
    const row = railRow(page, sessionId);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => await railTitleText(page, sessionId), {
        timeout: 15_000,
      })
      .toContain("Aggiungi tre film di riferimento");

    // Read the derived title text and assert the length cap + word boundary.
    const derived = await railTitleText(page, sessionId);
    expect(derived.length).toBeLessThanOrEqual(DERIVED_TITLE_MAX);
    // The full message contains the derived title verbatim (boundary
    // truncation, no mid-word cut and no auto-quote).
    expect("Aggiungi tre film di riferimento al soggetto").toContain(derived);

    // Send a SECOND message in the central route — the title must NOT change.
    // Scope to the central composer (the Cesare drawer mounts a second one).
    const composer = page.getByTestId("session-composer");
    await composer
      .getByTestId("cesare-composer-input")
      .fill("Va bene così, procediamo");
    await composer.getByTestId("cesare-send-btn").click();

    // Give the second turn time to settle + invalidate; the title is unchanged.
    await expect
      .poll(async () => await railTitleText(page, sessionId), {
        timeout: 15_000,
      })
      .toBe(derived);
  });

  test("inline rename: …-menu → Rinomina → Enter commits in rail + central route; Esc cancels", async ({
    authenticatedPage: page,
  }) => {
    const sessionId = await createSessionFromFirstMessage(
      page,
      "Rivedi la struttura del secondo atto",
    );
    const row = railRow(page, sessionId);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Open the …-menu and pick Rinomina.
    await row.getByTestId("session-actions-btn").click();
    await page.getByTestId("session-rename-item").click();

    const input = page.getByTestId("session-rename-input");
    await expect(input).toBeVisible();
    await input.fill("Struttura secondo atto");
    await input.press("Enter");

    // Rail reflects the new title.
    await expect
      .poll(async () => await railTitleText(page, sessionId), {
        timeout: 15_000,
      })
      .toBe("Struttura secondo atto");

    // The central route heading reflects it too (same sessions context).
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Struttura secondo atto" }),
    ).toBeVisible({ timeout: 15_000 });

    // Esc cancels a subsequent edit (title stays).
    await railRow(page, sessionId).getByTestId("session-actions-btn").click();
    await page.getByTestId("session-rename-item").click();
    const input2 = page.getByTestId("session-rename-input");
    await expect(input2).toBeVisible();
    await input2.fill("QUESTO NON DEVE RESTARE");
    await input2.press("Escape");
    await expect
      .poll(async () => await railTitleText(page, sessionId), {
        timeout: 10_000,
      })
      .toBe("Struttura secondo atto");
  });

  test("delete: …-menu → Elimina opens the modal; Annulla keeps it; Elimina removes the row + navigates away", async ({
    authenticatedPage: page,
  }) => {
    const sessionId = await createSessionFromFirstMessage(
      page,
      "Bozza veloce di una scena di apertura",
    );
    const row = railRow(page, sessionId);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Open the …-menu and pick Elimina → the confirmation modal opens.
    await row.getByTestId("session-actions-btn").click();
    await page.getByTestId("session-delete-item").click();

    const dialog = page.getByTestId("session-delete-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText("L'azione non è reversibile.");

    // Annulla closes the modal WITHOUT deleting the session.
    await dialog.getByTestId("confirm-dialog-cancel-btn").click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    await expect(railRow(page, sessionId)).toBeVisible();

    // Re-open the modal and confirm — the row leaves the list and, because the
    // session is the open one, the route navigates back to the landing.
    await railRow(page, sessionId).getByTestId("session-actions-btn").click();
    await page.getByTestId("session-delete-item").click();
    const dialog2 = page.getByTestId("session-delete-dialog");
    await expect(dialog2).toBeVisible({ timeout: 5_000 });
    await dialog2.getByTestId("confirm-dialog-confirm-btn").click();

    await page.waitForURL(`**/projects/${TEAM_PROJECT_ID}/sessions`, {
      timeout: 15_000,
    });
    await expect(railRow(page, sessionId)).toHaveCount(0, { timeout: 15_000 });
  });
});
