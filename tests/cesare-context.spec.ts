import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import {
  navigateToBreakdown,
  openSceneInBreakdown,
  TEAM_PROJECT_ID,
} from "./breakdown/helpers";
import { navigateToLocations, LOCATIONS_PROJECT_ID } from "./locations/helpers";

// ─── shared helpers ───────────────────────────────────────────────────────────

/** Open the floating Cesare chat sheet via the action bar pill. */
async function openCesareSheet(page: typeof test.prototype.page) {
  const trigger = page.getByRole("button", { name: /Cesare — .* note/ });
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();
  await expect(page.getByPlaceholder("Chiedi a Cesare…")).toBeVisible({
    timeout: 5_000,
  });
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
  // Send button re-enables when the response is complete
  await expect(page.getByTestId("cesare-send-btn")).toBeEnabled({
    timeout: 60_000,
  });
  const messages = page.locator('[role="log"] p, [role="log"] li');
  const count = await messages.count();
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
  test(
    "[OHW-514] Cesare cites scene dialogue when asked about active scene",
    async ({ authenticatedPage }) => {
      await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
      await openSceneInBreakdown(authenticatedPage, 1);
      await openCesareSheet(authenticatedPage);

      await sendCesareMessage(
        authenticatedPage,
        "Cosa dice John in questa scena? Cita una sua battuta.",
      );
      const reply = await waitForCesareReply(authenticatedPage);

      // scenes.notes for scene 1 contains John's open-mic lines.
      // Cesare must reference scene content — not deflect with "non ho info".
      expect(reply.toLowerCase()).toMatch(/john|battuta|dialogo|scena/);
      expect(reply).not.toMatch(/non (ho|posso|riesco)/i);
    },
  );

  test(
    "[OHW-514b] Cesare window includes adjacent scenes (n-2 / n+2)",
    async ({ authenticatedPage }) => {
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
    },
  );

  test(
    "[OHW-514c] Scene context resets to null when no scene is active",
    async ({ authenticatedPage }) => {
      await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
      await authenticatedPage.getByRole("button", { name: "Per progetto" }).click();
      await openCesareSheet(authenticatedPage);

      await sendCesareMessage(
        authenticatedPage,
        "Quante scene ha questo progetto?",
      );
      const reply = await waitForCesareReply(authenticatedPage);

      // Should answer from project-level context, not crash
      expect(reply).toMatch(/scen/i);
    },
  );
});

/**
 * [OHW-514d] Spec 32 — RAG context: screenplay editor
 *
 * Scrolling to a scene publishes sceneNumber via ActiveSceneContext.
 * Cesare receives the ±2 window even though the scene UUID is unknown
 * (sentinel sceneId = "").
 */
test.describe("[Spec 32] Cesare RAG — Screenplay editor", () => {
  test(
    "[OHW-514d] Cesare knows active scene after scroll in editor",
    async ({ authenticatedPage }) => {
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
    },
  );
});

/**
 * [OHW-520] Spec 32 — RAG context: locations page
 *
 * When a requirement is active, Cesare receives the scenes linked to it
 * (not a number window) and can reason about their narrative content.
 */
test.describe("[Spec 32] Cesare RAG — Locations", () => {
  test(
    "[OHW-520] Cesare cites linked scene content for active requirement",
    async ({ authenticatedPage }) => {
      await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

      const firstReq = authenticatedPage
        .getByTestId("location-requirement-card")
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
    },
  );
});

/**
 * [OHW-521] Spec 31 — Cesare agentic scouting: search_places tool
 *
 * Asking Cesare to find a location triggers the search_places tool call,
 * which hits the Google Places API and creates real locationCandidates in
 * the DB. The candidates must appear on the locations map after the response.
 */
test.describe("[Spec 31] Cesare Agentic Scouting — search_places", () => {
  test(
    "[OHW-521] Cesare finds real candidates when asked to scout a location",
    async ({ authenticatedPage }) => {
      await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

      const firstReq = authenticatedPage
        .getByTestId("location-requirement-card")
        .first();
      await firstReq.click();

      await openCesareSheet(authenticatedPage);

      await sendCesareMessage(
        authenticatedPage,
        "Cerca ristoranti nel centro di Roma adatti per questa scena.",
      );
      const reply = await waitForCesareReply(authenticatedPage);

      expect(reply).toMatch(/trovato|aggiunto|candidat/i);
    },
  );

  test(
    "[OHW-521b] Candidates added by Cesare appear on the locations map",
    async ({ authenticatedPage }) => {
      await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

      const firstReq = authenticatedPage
        .getByTestId("location-requirement-card")
        .first();
      await firstReq.click();

      const cardsBefore = await authenticatedPage
        .getByTestId("location-candidate-card")
        .count();

      await openCesareSheet(authenticatedPage);
      await sendCesareMessage(
        authenticatedPage,
        "Trova due bar nel quartiere Testaccio di Roma.",
      );
      await waitForCesareReply(authenticatedPage);

      // onAssistantResponse triggers invalidateQueries → list re-fetches
      const cardsAfter = await authenticatedPage
        .getByTestId("location-candidate-card")
        .count();
      expect(cardsAfter).toBeGreaterThan(cardsBefore);
    },
  );

  test(
    "[OHW-521c] add_candidate rejects gracefully for non-existent requirement",
    async ({ authenticatedPage }) => {
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
    },
  );
});

/**
 * [OHW-522] Quick prompts contextual update
 *
 * Prompts switch INITIAL → FOLLOWUP after Cesare's first reply.
 * On locations, switch to AFTER_SEARCH when Cesare confirms it found candidates.
 */
test.describe("[Spec 31/32] Cesare — dynamic quick prompts", () => {
  test(
    "[OHW-522] Quick prompts change from initial to followup after first reply",
    async ({ authenticatedPage }) => {
      await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
      await openSceneInBreakdown(authenticatedPage, 1);
      await openCesareSheet(authenticatedPage);

      await expect(
        authenticatedPage.getByRole("button", {
          name: "Cosa costa di più in questa scena?",
        }),
      ).toBeVisible();

      await sendCesareMessage(authenticatedPage, "Ciao Cesare.");
      await waitForCesareReply(authenticatedPage);

      await expect(
        authenticatedPage.getByRole("button", { name: "Dove posso risparmiare?" }),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        authenticatedPage.getByRole("button", {
          name: "Cosa costa di più in questa scena?",
        }),
      ).not.toBeVisible();
    },
  );

  test(
    "[OHW-522b] Locations page shows after-search prompts when Cesare finds candidates",
    async ({ authenticatedPage }) => {
      await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

      const firstReq = authenticatedPage
        .getByTestId("location-requirement-card")
        .first();
      await firstReq.click();

      await openCesareSheet(authenticatedPage);

      await sendCesareMessage(
        authenticatedPage,
        "Trova una piazza nel centro storico di Napoli.",
      );
      await waitForCesareReply(authenticatedPage);

      await expect(
        authenticatedPage.getByRole("button", {
          name: "Scrivi una scheda sopralluogo dettagliata",
        }),
      ).toBeVisible({ timeout: 5_000 });
    },
  );
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
    test(
      `[OHW-523-${pageName}] Cesare opens and responds on ${pageName} page`,
      async ({ authenticatedPage }) => {
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
      },
    );
  }
});
