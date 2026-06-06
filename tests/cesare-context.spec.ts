import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import {
  navigateToBreakdown,
  openSceneInBreakdown,
  TEAM_PROJECT_ID,
} from "./breakdown/helpers";
import {
  navigateToLocations,
  LOCATIONS_PROJECT_ID,
  SEEDED_LOCATION_REQ_1_ID,
} from "./locations/helpers";
import {
  resetCesareState,
  setMockContext,
  clearMockContext,
} from "./helpers/cesare";

// ─── shared helpers ───────────────────────────────────────────────────────────

/** Open the floating Cesare chat sheet via the BottomDock pill. The dock pill's
 *  react-aria press can be cancelled by layout settling on heavy routes, so we
 *  retry the click until the shell reports the drawer open. */
async function openCesareSheet(page: typeof test.prototype.page) {
  const trigger = page
    .getByTestId("bottom-dock")
    .getByTestId("cesare-open-btn");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await trigger.click();
    expect(await page.evaluate(() => document.body.dataset.cesare)).toBe(
      "expanded",
    );
  }).toPass({ timeout: 15_000 });
  await expect(page.getByPlaceholder("Chiedi a Cesare…")).toBeVisible({
    timeout: 5_000,
  });
  await page.waitForTimeout(400);
}

async function sendCesareMessage(
  page: typeof test.prototype.page,
  text: string,
): Promise<void> {
  const input = page.getByPlaceholder("Chiedi a Cesare…");
  await input.click();
  await input.fill(text);
  await page.keyboard.press("Enter");
}

/** Wait for Cesare to finish responding and return the last assistant message text. */
async function waitForCesareReply(
  page: typeof test.prototype.page,
): Promise<string> {
  // The conversation container carries `data-testid="cesare-conversation"`; the
  // assistant reply lands as ≥2 paragraphs total (user bubble + assistant).
  const log = page.getByTestId("cesare-conversation");
  const messages = log.locator("p, li");
  await expect
    .poll(async () => messages.count(), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(2);
  const count = await messages.count();
  if (count === 0) return "";
  return (await messages.nth(count - 1).textContent()) ?? "";
}

// ─── describe blocks ──────────────────────────────────────────────────────────

/**
 * [OHW-514] Spec 32 — RAG context: breakdown page
 *
 * Cesare receives the full Fountain body of the active scene (scenes.notes)
 * and can cite specific dialogue and actions without the user pasting the text.
 */
test.describe("[Spec 32] Cesare RAG — Breakdown", () => {
  // Reset the persisted Cesare conversation between serial tests so
  // `waitForCesareReply` never returns a stale bubble from a prior turn.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("[OHW-514] Cesare cites scene dialogue when asked about active scene", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await openSceneInBreakdown(authenticatedPage, 1);
    await openCesareSheet(authenticatedPage);

    // Phrase the question so it hits the read_scene mock scenario (it keys on
    // "… nella scena 1"); the active scene is scene 1.
    await sendCesareMessage(
      authenticatedPage,
      "Cosa dice John nella scena 1? Cita una sua battuta.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // scenes.notes for scene 1 contains John's open-mic lines.
    // Cesare must reference scene content — not deflect with "non ho info".
    expect(reply.toLowerCase()).toMatch(/john|battuta|dialogo|scena/);
    expect(reply).not.toMatch(/non (ho|posso|riesco)/i);
  });

  // KNOWN GAP: this RAG assertion needs Cesare to answer a free-language
  // question about the scene window ("which scenes precede/follow this one?").
  // The MOCK_AI tool-loop scenarios (`cesare-tool-loop.mock.ts`) have no matching
  // entry, so the mock returns its generic "no specific tool to invoke" fallback
  // and the assertion can't pass under MOCK_AI. Real-AI verification is required;
  // marked fixme until a mock scenario is added or it moves to a real-AI lane.
  test.fixme("[OHW-514b] Cesare window includes adjacent scenes (n-2 / n+2)", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await openSceneInBreakdown(authenticatedPage, 3);
    await openCesareSheet(authenticatedPage);

    await sendCesareMessage(
      authenticatedPage,
      "Quali scene precedono e seguono questa?",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // windowSize=2 around scene 3 → scenes 1,2,3,4,5 loaded in context
    expect(reply).toMatch(/scena (1|2|4|5)/i);
  });

  // KNOWN GAP: same MOCK_AI limitation as OHW-514b — "how many scenes does this
  // project have?" has no mock tool scenario, so the generic fallback reply does
  // not satisfy the content assertion. (The view-mode toggle is also a react-aria
  // SegmentedControl radio now, not a plain "Per progetto" button.) Needs a mock
  // scenario or a real-AI lane; fixme until then.
  test.fixme("[OHW-514c] Scene context resets to null when no scene is active", async ({
    authenticatedPage,
  }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await authenticatedPage
      .getByRole("button", { name: "Per progetto" })
      .click();
    await openCesareSheet(authenticatedPage);

    await sendCesareMessage(
      authenticatedPage,
      "Quante scene ha questo progetto?",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // Should answer from project-level context, not crash
    expect(reply).toMatch(/scen/i);
  });
});

/**
 * [OHW-514d] Spec 32 — RAG context: screenplay editor
 *
 * Scrolling to a scene publishes sceneNumber via ActiveSceneContext.
 * Cesare receives the ±2 window even though the scene UUID is unknown
 * (sentinel sceneId = "").
 */
test.describe("[Spec 32] Cesare RAG — Screenplay editor", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  // KNOWN GAP: "give me an analysis of the current scene" has no MOCK_AI tool
  // scenario, so the mock returns its short generic fallback (< 80 chars) and the
  // RAG content assertion can't pass under MOCK_AI. Needs a mock scenario or a
  // real-AI lane; fixme until then.
  test.fixme("[OHW-514d] Cesare knows active scene after scroll in editor", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    // Editor publishes currentSceneIndex=0 on mount (scene 1 visible)
    await openCesareSheet(authenticatedPage);

    await sendCesareMessage(
      authenticatedPage,
      "Dammi un'analisi della scena corrente.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // Cesare must reference content, not ask "di quale scena parli?"
    expect(reply).not.toMatch(/quale scena/i);
    expect(reply.length).toBeGreaterThan(80);
  });
});

/**
 * [OHW-520] Spec 32 — RAG context: locations page
 *
 * When a requirement is active, Cesare receives the scenes linked to it
 * (not a number window) and can reason about their narrative content.
 */
test.describe("[Spec 32] Cesare RAG — Locations", () => {
  // Reset the persisted Cesare conversation so `waitForCesareReply` never picks
  // up a stale bubble from a prior serial test.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, LOCATIONS_PROJECT_ID);
  });

  test("[OHW-520] Cesare cites linked scene content for active requirement", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await firstReq.click();

    await openCesareSheet(authenticatedPage);

    await sendCesareMessage(
      authenticatedPage,
      "Quali elementi della scena sono rilevanti per scegliere questa location?",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    expect(reply.length).toBeGreaterThan(80);
    expect(reply).not.toMatch(/non ho informazioni/i);
  });
});

/**
 * [OHW-521] Spec 31 — Cesare agentic scouting: search_places tool
 *
 * Asking Cesare to find a location triggers the search_places tool call,
 * which hits the Google Places API and creates real locationCandidates in
 * the DB. The candidates must appear on the locations map after the response.
 */
test.describe("[Spec 31] Cesare Agentic Scouting — search_places", () => {
  // The scouting mock scenario emits an `add_candidate` tool_use whose
  // requirement_id is the `{{REQ_ID}}` placeholder; seed it with the real
  // seeded requirement so the candidate lands on an existing row. Also reset the
  // persisted Cesare conversation: this suite runs serially on a shared DB, and a
  // prior test's bubbles would let `waitForCesareReply` return a stale (user)
  // paragraph before the assistant reply lands. Clear context after.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, LOCATIONS_PROJECT_ID);
    await clearMockContext(authenticatedPage);
    await setMockContext(authenticatedPage, {
      REQ_ID: SEEDED_LOCATION_REQ_1_ID,
    });
  });
  test.afterEach(async ({ authenticatedPage }) => {
    await clearMockContext(authenticatedPage);
  });

  test("[OHW-521] Cesare finds real candidates when asked to scout a location", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await firstReq.click();

    await openCesareSheet(authenticatedPage);

    await sendCesareMessage(
      authenticatedPage,
      "Cerca ristoranti nel centro di Roma adatti per questa scena.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    expect(reply).toMatch(/trovato|aggiunto|candidat/i);
  });

  test("[OHW-521b] Candidates added by Cesare appear on the locations map", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await firstReq.click();

    const cardsBefore = await authenticatedPage
      .locator('[data-testid^="candidate-card-"]')
      .count();

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Trova due bar nel quartiere Testaccio di Roma.",
    );
    await waitForCesareReply(authenticatedPage);

    // onAssistantResponse triggers invalidateQueries → list re-fetches
    await expect
      .poll(
        async () =>
          authenticatedPage.locator('[data-testid^="candidate-card-"]').count(),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(cardsBefore);
  });

  test("[OHW-521c] add_candidate rejects gracefully for non-existent requirement", async ({
    authenticatedPage,
  }) => {
    // Security guard: server rejects candidates attached to unknown/foreign
    // requirements. The error surface must be a Cesare message, not a 500.
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);
    await openCesareSheet(authenticatedPage);

    await sendCesareMessage(
      authenticatedPage,
      "Aggiungi una location al requisito 00000000-0000-0000-0000-000000000000.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    expect(reply).not.toMatch(/500|errore interno/i);
  });
});

/**
 * [OHW-522] Quick prompts contextual update
 *
 * Prompts switch INITIAL → FOLLOWUP after Cesare's first reply.
 * On locations, switch to AFTER_SEARCH when Cesare confirms it found candidates.
 */
test.describe("[Spec 31/32] Cesare — dynamic quick prompts", () => {
  // The quick prompts start in the INITIAL set only when the conversation is
  // empty; once Cesare has replied they switch to FOLLOWUP. Since Spec 51 the
  // chat persists across tests on the shared DB, so a prior test's conversation
  // would leave the prompts already in FOLLOWUP. Reset the persisted sessions so
  // each test opens a genuinely fresh conversation.
  test.beforeEach(async ({ authenticatedPage }) => {
    // TEAM_PROJECT_ID and LOCATIONS_PROJECT_ID are the same seeded project.
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("[OHW-522] Quick prompts show in the empty state and clear once the conversation starts", async ({
    authenticatedPage,
  }) => {
    // The INITIAL → FOLLOWUP quick-prompt text swap was retired: the per-page
    // quick prompts now render ONLY in the empty conversation state (alongside
    // the NextStepChip) and disappear once the first message is sent — there is
    // no second "followup" prompt set. We assert the new behaviour: an initial
    // prompt is visible on a fresh conversation, and after the first reply the
    // quick-prompt strip is gone.
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await openSceneInBreakdown(authenticatedPage, 1);
    await openCesareSheet(authenticatedPage);

    const initialPrompt = authenticatedPage.getByRole("button", {
      name: "Cosa costa di più in questa scena?",
    });
    await expect(initialPrompt).toBeVisible({ timeout: 10_000 });

    await sendCesareMessage(authenticatedPage, "Ciao Cesare.");
    await waitForCesareReply(authenticatedPage);

    // The conversation is no longer empty → the quick-prompt strip is gone.
    await expect(initialPrompt).toBeHidden({ timeout: 5_000 });
  });

  test("[OHW-522b] Locations page shows its empty-state quick prompts, which clear after the first reply", async ({
    authenticatedPage,
  }) => {
    // The dynamic AFTER_SEARCH prompt set was retired together with the
    // INITIAL → FOLLOWUP swap: the locations page now shows the same
    // empty-state quick prompts as every other page, and they clear once the
    // conversation starts (no separate after-search prompt set).
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await firstReq.click();

    await openCesareSheet(authenticatedPage);

    const locationsPrompt = authenticatedPage.getByRole("button", {
      name: "Trova candidati per questa location",
    });
    await expect(locationsPrompt).toBeVisible({ timeout: 10_000 });

    await sendCesareMessage(
      authenticatedPage,
      "Trova una piazza nel centro storico di Napoli.",
    );
    await waitForCesareReply(authenticatedPage);

    await expect(locationsPrompt).toBeHidden({ timeout: 5_000 });
  });
});

/**
 * [OHW-523] Cesare context across all pages — smoke tests
 *
 * Verifies that Cesare opens and returns a non-empty response on every page
 * that has a trigger. Catches wiring regressions (server fn, prompt assembly,
 * response delivery) for pages without deeper dedicated tests.
 */
test.describe("[Spec 32] Cesare — context smoke tests per page", () => {
  for (const [pageName, path] of [
    ["budget", `${BASE_URL}/projects/${TEAM_PROJECT_ID}/budget`],
    ["schedule", `${BASE_URL}/projects/${TEAM_PROJECT_ID}/schedule`],
    ["shooting-plan", `${BASE_URL}/projects/${TEAM_PROJECT_ID}/shooting-plan`],
    ["soggetto", `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`],
    ["synopsis", `${BASE_URL}/projects/${TEAM_PROJECT_ID}/synopsis`],
    ["outline", `${BASE_URL}/projects/${TEAM_PROJECT_ID}/outline`],
    ["treatment", `${BASE_URL}/projects/${TEAM_PROJECT_ID}/treatment`],
  ] as const) {
    test(`[OHW-523-${pageName}] Cesare opens and responds on ${pageName} page`, async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(path);
      await authenticatedPage.waitForLoadState("networkidle");

      await openCesareSheet(authenticatedPage);

      await sendCesareMessage(
        authenticatedPage,
        "Dammi un riassunto dello stato attuale del progetto.",
      );
      const reply = await waitForCesareReply(authenticatedPage);

      expect(reply.length).toBeGreaterThan(40);
      expect(reply).not.toMatch(/errore|error|500/i);
    });
  }
});
