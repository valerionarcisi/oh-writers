import { test, expect } from "./fixtures";
import {
  navigateToLocations,
  LOCATIONS_PROJECT_ID,
  SEEDED_LOCATION_REQ_1_ID,
} from "./locations/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  setMockContext,
} from "./helpers/cesare";

/**
 * [Spec 34] Cesare agentic — Locations
 *
 * Verifies the agentic locations flow end-to-end against the mock LLM:
 * the user asks Cesare to find candidates, the scripted scenario emits an
 * `add_candidate` tool_use, the real executor writes a row in
 * `location_candidates`, and the UI surfaces both the new candidate card and
 * the "✦ Cesare ha aggiornato le location" toast.
 *
 * The mock LLM is wired by playwright.config.ts (MOCK_AI=true) — see
 * apps/web/app/features/predictions/__mocks__/cesare-tool-loop.mock.ts for the
 * scenario library.
 */
test.describe("[Spec 34] Cesare Agentic — Locations", () => {
  test("[OHW-540] Cesare adds a candidate via add_candidate tool", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    // Activate the first seeded requirement so the page passes its UUID along
    // in the Cesare page context.
    const firstReq = authenticatedPage
      .locator('[data-testid^="requirement-row-"]')
      .first();
    await expect(firstReq).toBeVisible({ timeout: 10_000 });
    await firstReq.click();

    // Seed the placeholder map so {{REQ_ID}} in the scripted tool input gets
    // substituted with the real seeded requirement UUID.
    await setMockContext(authenticatedPage, {
      REQ_ID: SEEDED_LOCATION_REQ_1_ID,
    });

    const cardsBefore = await authenticatedPage
      .locator('[data-testid^="candidate-card-"]')
      .count();

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Trova candidati per questa scena.");
    const reply = await waitForCesareReply(authenticatedPage);

    expect(reply.length).toBeGreaterThan(10);

    // The list refetches via onAssistantResponse → invalidateQueries. Wait for
    // the count to increase rather than reading once — TanStack Query's
    // invalidation is async.
    await expect
      .poll(
        async () =>
          authenticatedPage
            .locator('[data-testid^="candidate-card-"]')
            .count(),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(cardsBefore);

    // Toast is fired by AppShell.handleCesareAssistantResponse when the reply
    // text contains "aggiunto" / "candidato" / "trovato".
    await expect(
      authenticatedPage.getByText("✦ Cesare ha aggiornato le location"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
