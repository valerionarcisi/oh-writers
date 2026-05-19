import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./breakdown/helpers";
import { navigateToLocations, LOCATIONS_PROJECT_ID } from "./locations/helpers";
import { openCesareSheet, sendCesareMessage } from "./helpers/cesare";

/**
 * [Spec 29 — Cesare cost foundation] regression guards
 *
 * Verifies the three layers shipped in commit b0dc538:
 *   1. SystemPromptBlock[] with ephemeral cache_control segments
 *   2. Lazy-RAG via read_scene / read_* tools
 *   3. Model tier router (Haiku vs Sonnet)
 *
 * The mock LLM client doesn't expose the model id back to the test, so these
 * specs assert the *integration* still completes cleanly: replies arrive, the
 * read tool flow returns scene body, and a multi-turn conversation does not
 * regress when subsequent calls re-hit the cached system blocks.
 */

// Multi-turn-safe variant of waitForCesareReply. The shared helpers/cesare.ts
// version polls for `paragraph count >= 2` which immediately resolves on the
// second turn (the user paragraph alone bumps the count past 2). Here we
// count assistant bubbles directly — they grow by exactly one per Cesare
// roundtrip. The transient LoadingIndicator also has the "bubbleAssistant"
// class, so we filter it out via `:not([aria-busy="true"])`.
//
// CSS module class names are hashed by Vite as `<original>_<hash>` (default
// `generateScopedName`), so `[class*="bubbleAssistant"]` survives the hash.
const ASSISTANT_BUBBLE = '[class*="bubbleAssistant"]:not([aria-busy="true"])';

async function sendAndWaitForReply(
  page: Page,
  prompt: string,
): Promise<string> {
  const log = page.getByRole("log", { name: /Cesare/i });
  const before = await log.locator(ASSISTANT_BUBBLE).count();
  await sendCesareMessage(page, prompt);
  await expect
    .poll(async () => log.locator(ASSISTANT_BUBBLE).count(), {
      timeout: 30_000,
    })
    .toBeGreaterThan(before);
  const bubbles = log.locator(ASSISTANT_BUBBLE);
  const n = await bubbles.count();
  return (await bubbles.nth(n - 1).textContent()) ?? "";
}

test.describe("[Spec 29] Cesare cost foundation — regression guards", () => {
  test("[OHW-560] Router integration: short Q, imperative, long prompt all reply", async ({
    authenticatedPage,
  }) => {
    // Screenplay is not an agentic page — handleAskCesare returns the canned
    // mockResponse for "screenplay". The point of this test is to drive the
    // routeModel branch with three distinct prompt shapes (Haiku candidate,
    // Sonnet candidate via imperative, Sonnet candidate via length) and
    // confirm none of them hang or error.
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);

    const prompts: ReadonlyArray<string> = [
      "Che pensi?",
      "Aggiungi una nota sul ritmo della scena.",
      "Mi puoi aiutare a capire nel dettaglio cosa funziona e cosa non funziona in questa scena, considerando anche il ritmo, il sottotesto, i silenzi tra le battute, e in particolare la scelta del punto di vista? Vorrei una lettura ampia, non sintetica.",
    ];

    for (const prompt of prompts) {
      const reply = await sendAndWaitForReply(authenticatedPage, prompt);
      expect(reply.length).toBeGreaterThan(0);
    }
  });

  test("[OHW-561] Read-tool invocation: read_scene returns seeded dialogue", async ({
    authenticatedPage,
  }) => {
    // Breakdown is an agentic page. The mock scenario for this prompt emits
    // a read_scene tool_use; the real executor reads scene 1 of the seeded
    // team project and the mock's follow-up turn cites a string from the
    // notes so we can assert end-to-end.
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await expect(authenticatedPage.getByTestId("scene-cost-panel")).toBeVisible(
      { timeout: 20_000 },
    );

    await openCesareSheet(authenticatedPage);
    const reply = await sendAndWaitForReply(
      authenticatedPage,
      "Che dice John nella scena 1?",
    );

    // Mock scenario echoes the seeded scene 1 dialogue. If the read_scene
    // tool was wired correctly, the loop will have executed it and the final
    // assistant turn will surface this string.
    expect(reply).toContain("Non avrei mai dovuto tornare");
  });

  test("[OHW-562] Multi-turn cached context: 5 consecutive replies arrive", async ({
    authenticatedPage,
  }) => {
    // Locations is agentic — the system prompt is built from cached blocks
    // plus a dynamic state block. This drives 5 turns through the same
    // SystemPromptBlock[] shape to catch regressions where subsequent calls
    // would break (e.g. accidentally mutating the block array, or a stale
    // turn-tracker key).
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);
    await openCesareSheet(authenticatedPage);

    for (let i = 0; i < 5; i++) {
      const reply = await sendAndWaitForReply(authenticatedPage, "ok");
      expect(reply.length).toBeGreaterThan(0);
    }
  });
});
