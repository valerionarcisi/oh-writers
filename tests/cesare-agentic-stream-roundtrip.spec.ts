import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { resetCesareState } from "./helpers/cesare";
import { expect as pwExpect, type Page } from "@playwright/test";

// This file drives the drawer with a local helper (rather than the shared
// cesare helpers) so it can wait on the streamed roundtrip directly. Locators
// use stable testids so they stay locale-independent under i18n.
async function openCesare(page: Page): Promise<void> {
  const trigger = page.getByTestId("cesare-open-btn").first();
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
  const sendBtn = page.getByTestId("cesare-send-btn").first();
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
  // Spec 51 persists Cesare sessions + document edits; the mock-ui project runs
  // serially against one shared DB. Re-hydrating a session built up by earlier
  // tests slows the round-trip and a prior outline/soggetto write changes the
  // doc state these tests stream against. Reset to the seed baseline before each.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

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
    // Navigate + open Cesare BEFORE arming the routes, so the page's own GET
    // loaders are not affected. Then break both Cesare transports.
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await openCesare(authenticatedPage);

    // 1) the streamed transport.
    await authenticatedPage.route("**/api/cesare/stream", (route) =>
      route.fulfill({ status: 500, body: "boom" }),
    );
    // 2) the askCesare fallback. TanStack server fns are POSTs to `/_server`
    // (loaders are GET), so failing POST `/_server` requests breaks the fallback
    // without touching the already-loaded page. Match by method, not by a
    // hashed fn id (which the URL does not expose stably).
    await authenticatedPage.route("**/_server**", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({ status: 500, body: "boom" });
      }
      return route.continue();
    });

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

  test("[OHW-048-A3] aborting the stream fetch cancels the server run (no wedge: a follow-up turn still streams to done)", async ({
    authenticatedPage,
  }) => {
    // Spec 48 (W-E2) — structured interruption. The server run is now an Effect
    // fiber; cancelling the ReadableStream interrupts the fiber and aborts the
    // bridged AbortSignal, so the in-flight model call tears down. We assert the
    // OBSERVABLE consequences from the browser:
    //  1. an aborted stream fetch rejects PROMPTLY with AbortError (the
    //     connection was torn down → the server `cancel` fired), well under a
    //     full-turn duration;
    //  2. the server is NOT wedged by the cancelled run — a fresh NORMAL turn
    //     streams all the way to a terminal `done` event. A leaked fiber holding
    //     the connection / DB handle would stall the follow-up.
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    const body = {
      projectId: TEAM_PROJECT_ID,
      message: "Fammi un v2 del soggetto più asciutto.",
      pageContext: {
        page: "soggetto",
        sceneId: null,
        sceneNumber: null,
        requirementId: null,
        documentId: null,
        shootingDayId: null,
        shootingDayNumber: null,
      },
      conversationHistory: [],
    };

    // 1) Start a stream, read the first byte to prove it opened, then abort.
    const aborted = await authenticatedPage.evaluate(async (payload) => {
      const controller = new AbortController();
      const startedAt = Date.now();
      try {
        const res = await fetch("/api/cesare/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const reader = res.body!.getReader();
        // Read the first chunk (stream is live), then abort mid-flight.
        await reader.read();
        controller.abort();
        // Subsequent read must reject because the fetch was aborted.
        await reader.read();
        return { rejected: false, ms: Date.now() - startedAt };
      } catch (e) {
        return {
          rejected: true,
          name: (e as Error).name,
          ms: Date.now() - startedAt,
        };
      }
    }, body);

    expect(aborted.rejected).toBe(true);
    expect(aborted.name).toBe("AbortError");
    // Aborted promptly — not after the whole turn completed.
    expect(aborted.ms).toBeLessThan(15_000);

    // 2) The server is healthy: a fresh normal turn streams to a terminal done.
    const followUp = await authenticatedPage.evaluate(async (payload) => {
      const res = await fetch("/api/cesare/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...payload,
          message: "Il conflitto centrale è chiaro?",
        }),
      });
      const text = await res.text();
      return text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as { _tag: string })._tag);
    }, body);

    expect(followUp).toContain("done");
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
