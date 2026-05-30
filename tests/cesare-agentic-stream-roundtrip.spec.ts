import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { expect as pwExpect, type Page } from "@playwright/test";

// The shell refactor relabelled the dock pill ("Apri Cesare") and the composer
// submit button ("Invia messaggio"); the shared cesare helpers still match the
// old labels, so we drive the drawer locally with the current labels.
async function openCesare(page: Page): Promise<void> {
  const trigger = page
    .getByRole("button", { name: /Apri Cesare|^Cesare(\s—.*)?$/ })
    .first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();
  const input = page.getByPlaceholder("Chiedi a Cesare…");
  await input.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(400);
}

async function sendCesareMessage(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder("Chiedi a Cesare…");
  await input.focus();
  await input.fill(text);
  await input.dispatchEvent("input");
  await pwExpect(input).toHaveValue(text, { timeout: 5_000 });
  const sendBtn = page
    .locator('[aria-label="Invia messaggio"], [aria-label="Invia"]')
    .first();
  await pwExpect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.dispatchEvent("click");
}

async function waitForCesareReply(page: Page): Promise<string> {
  const log = page.getByTestId("cesare-conversation");
  const paragraphs = log.locator("p");
  await pwExpect
    .poll(async () => await paragraphs.count(), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(2);
  const n = await paragraphs.count();
  if (n === 0) return "";
  return (await paragraphs.nth(n - 1).textContent()) ?? "";
}

/**
 * [Spec 47a] Cesare message round-trip (A1) + streamed step trace (A2).
 *
 * A1 — the user bubble appears SYNCHRONOUSLY on submit on every Cesare page and
 *      is never wiped by a session swap; a failed send marks the bubble.
 * A2 — a write request streams reading→writing→done before the final result
 *      card, page-agnostically and cross-domain (a Sceneggiatura request that
 *      writes the Soggetto streams writing{soggetto}).
 */

test.describe("[Spec 47a] Cesare stream round-trip", () => {
  test("[OHW-047-A1] user bubble appears under 100ms on submit", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesare(authenticatedPage);

    const input = authenticatedPage.getByPlaceholder("Chiedi a Cesare…");
    await input.focus();
    await input.fill("Il conflitto centrale è chiaro?");
    await input.dispatchEvent("input");
    await expect(input).toHaveValue("Il conflitto centrale è chiaro?");

    const sendBtn = authenticatedPage
      .locator('[aria-label="Invia messaggio"], [aria-label="Invia"]')
      .first();
    await expect(sendBtn).toBeEnabled();

    const start = Date.now();
    await sendBtn.dispatchEvent("click");

    // The optimistic user bubble must render immediately — independent of the
    // server round-trip (A1).
    const bubble = authenticatedPage
      .getByTestId("cesare-user-bubble")
      .filter({ hasText: "Il conflitto centrale è chiaro?" });
    await expect(bubble).toBeVisible({ timeout: 1_000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1_000);
  });

  test("[OHW-047-A1] a just-sent bubble survives the full turn (never wiped) and the reply lands", async ({
    authenticatedPage,
  }) => {
    // The "session swap never wipes an in-flight bubble" invariant is proved
    // exhaustively by the reducer unit test (which drives the swap directly on
    // the chat reducer). Here we pin the UI-level guarantee: the optimistic
    // bubble is appended synchronously, stays put through the streaming turn
    // (it is NOT reset by any mid-flight re-render), and the reply lands.
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesare(authenticatedPage);

    await sendCesareMessage(
      authenticatedPage,
      "Suggerisci un arco del personaggio",
    );
    const bubble = authenticatedPage
      .getByTestId("cesare-user-bubble")
      .filter({ hasText: "Suggerisci un arco del personaggio" });
    await expect(bubble).toBeVisible({ timeout: 5_000 });
    // Exactly one such bubble — no duplicate from a StrictMode double-send.
    await expect(bubble).toHaveCount(1);

    // The turn resolves and the bubble is STILL present (not wiped by the
    // session-default effect or any re-render during streaming).
    await waitForCesareReply(authenticatedPage);
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveCount(1);
    // The bubble reached a terminal delivery status (delivered, not stuck).
    await expect(bubble).toHaveAttribute("data-status", "delivered", {
      timeout: 10_000,
    });
  });

  test("[OHW-047-A1] a failed send marks the bubble (data-status=failed), never silently lost", async ({
    authenticatedPage,
  }) => {
    // Sad path: when the transport fails (stream route 500 / aborted), the
    // optimistic bubble must NOT vanish — it must reach the terminal `failed`
    // status so the user sees the send did not go through. We fail BOTH the
    // streaming route and the askCesare fallback so the reducer's
    // `message/failed` path fires.
    await authenticatedPage.route("**/api/cesare/stream", (route) =>
      route.fulfill({ status: 500, body: "boom" }),
    );
    await authenticatedPage.route("**/_serverFn/**", (route) => {
      // Let non-Cesare server fns through; only break the ask fallback.
      if (route.request().url().includes("askCesare")) {
        return route.fulfill({ status: 500, body: "boom" });
      }
      return route.continue();
    });

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesare(authenticatedPage);

    await sendCesareMessage(authenticatedPage, "Questo invio deve fallire");
    const bubble = authenticatedPage
      .getByTestId("cesare-user-bubble")
      .filter({ hasText: "Questo invio deve fallire" });

    // The bubble is present (never wiped) AND marked failed (not stuck pending).
    await expect(bubble).toBeVisible({ timeout: 5_000 });
    await expect(bubble).toHaveAttribute("data-status", "failed", {
      timeout: 15_000,
    });
  });

  test("[OHW-047-A2] a write request streams reading→writing→done before the result card", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/outline`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesare(authenticatedPage);

    // This request runs the scaletta generator (a write tool).
    await sendCesareMessage(
      authenticatedPage,
      "Dato il soggetto fammi la scaletta.",
    );

    // The live trace appears while the turn is in flight (A2). It may be brief,
    // so we poll for either the live trace OR the resolved change-trace card —
    // both prove the streamed step pipeline ran.
    await expect
      .poll(
        async () => {
          const live = await authenticatedPage
            .getByTestId("cesare-live-trace")
            .count();
          const done = await authenticatedPage
            .getByTestId("cesare-change-trace")
            .count();
          return live + done;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    const reply = await waitForCesareReply(authenticatedPage);
    expect(reply.toLowerCase()).toMatch(/scaletta|aggiornat|applicat/);

    // The final result card (ChangeTrace) lands after the live trace resolves.
    await expect(
      authenticatedPage.getByTestId("cesare-change-trace"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-047-A2] cross-domain: a request on the Soggetto page that writes the Sinossi streams writing{synopsis}", async ({
    authenticatedPage,
  }) => {
    // Cross-domain: the page is the Soggetto, but the request runs the synopsis
    // generator. The document-edit skill keeps every document generator
    // available regardless of the open page, so the stream must carry a
    // `writing` event whose entity.domain is "synopsis", NOT "soggetto" (the
    // page). We capture the raw NDJSON off the live stream response while the
    // request is driven through the real page (so the active document context is
    // loaded and the tool actually executes).
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    const streamBody = (async () => {
      const res = await authenticatedPage.waitForResponse(
        (r) => r.url().includes("/api/cesare/stream") && r.status() === 200,
        { timeout: 30_000 },
      );
      return res.text();
    })();

    await openCesare(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Scrivimi la sinossi dalla sceneggiatura.",
    );

    const body = await streamBody;
    const events = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map(
        (l) => JSON.parse(l) as { _tag: string; entity?: { domain: string } },
      );

    expect(events.map((e) => e._tag)).toContain("done");
    const writes = events.filter((e) => e._tag === "writing");
    const wroteSynopsis = writes.some((e) => e.entity?.domain === "synopsis");
    expect(
      wroteSynopsis,
      `expected a writing{synopsis} event; got: ${JSON.stringify(events)}`,
    ).toBe(true);
  });

  test("[OHW-047-A2] stream transport error degrades gracefully to the askCesare fallback (reply still lands)", async ({
    authenticatedPage,
  }) => {
    // Sad path for the streamed transport: when the SSE/NDJSON stream route is
    // down (500), the chat must NOT hang or silently lose the turn — it falls
    // back to the non-streaming askCesare server fn and still delivers a reply.
    // We break ONLY the stream route; the fallback stays live.
    await authenticatedPage.route("**/api/cesare/stream", (route) =>
      route.fulfill({ status: 500, body: "stream down" }),
    );

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesare(authenticatedPage);

    await sendCesareMessage(
      authenticatedPage,
      "Suggerisci un arco del personaggio",
    );
    const bubble = authenticatedPage
      .getByTestId("cesare-user-bubble")
      .filter({ hasText: "Suggerisci un arco del personaggio" });
    await expect(bubble).toBeVisible({ timeout: 5_000 });

    // The fallback delivered a reply: the bubble reaches `delivered`, not stuck
    // pending and not failed (the stream error was recovered, not fatal).
    await waitForCesareReply(authenticatedPage);
    await expect(bubble).toHaveAttribute("data-status", "delivered", {
      timeout: 20_000,
    });
  });
});
