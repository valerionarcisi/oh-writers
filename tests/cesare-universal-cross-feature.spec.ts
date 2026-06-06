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
  clearMockContext,
  resetCesareState,
} from "./helpers/cesare";

/**
 * [Spec 43] Cesare universal tool layer — cross-feature behaviour.
 *
 * Cesare is a layer above the SaaS: from any page, every tool is callable.
 * These E2E tests pin the behaviour so a future refactor that re-gates the
 * tool surface by page fails loudly.
 */
test.describe("[Spec 43] Cesare universal tool layer", () => {
  // Two sources of cross-test bleed in this serial suite, both cleared per test:
  //  1. The mock-context setter persists server-side across requests; OHW-043-A
  //     seeds REQ_ID and never clears it — a leaked context steers the
  //     dispatcher in later tests.
  //  2. Since Spec 51 the Cesare chat persists sessions/messages; a prior test's
  //     conversation paragraphs would let `waitForCesareReply` return a STALE
  //     last bubble before the new reply lands. `resetCesareState` wipes the
  //     persisted sessions so each test opens a fresh conversation.
  test.beforeEach(async ({ authenticatedPage }) => {
    await clearMockContext(authenticatedPage);
    await resetCesareState(authenticatedPage, LOCATIONS_PROJECT_ID);
  });
  test.afterEach(async ({ authenticatedPage }) => {
    await clearMockContext(authenticatedPage);
  });

  test("[OHW-043-A] from locations page, Cesare resolves requirement_id itself + adds a candidate", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);

    // Seed the placeholder: even though the scripted scenario emits two
    // chained tool_uses (find_or_create + add_candidate), the mock layer
    // can't pipe the find_or_create result into the next turn. We pre-seed
    // REQ_ID so add_candidate lands on the existing seeded requirement.
    await setMockContext(authenticatedPage, {
      REQ_ID: SEEDED_LOCATION_REQ_1_ID,
    });

    const cardsBefore = await authenticatedPage
      .locator('[data-testid^="candidate-card-"]')
      .count();

    await openCesareSheet(authenticatedPage);
    // No "trova" / "cerca" keywords: we want to hit the OHW-043-A scenario
    // (aggiungi candidati per la scena 1), not the legacy OHW-540 one.
    await sendCesareMessage(
      authenticatedPage,
      "Aggiungimi candidati per la scena 1",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // Cesare must NEVER ask the user for a UUID. The whole point of the
    // new find_or_create_requirement_for_scene tool is exactly this.
    expect(reply).not.toMatch(/UUID|requirement[_ ]id/i);

    await expect
      .poll(
        async () =>
          authenticatedPage.locator('[data-testid^="candidate-card-"]').count(),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(cardsBefore);
  });

  test("[OHW-043-B] from locations page, rewrite_scene buffers a pending rewrite in sessionStorage", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);
    await openCesareSheet(authenticatedPage);
    // Use a phrase unique to the OHW-043-B cross-page scenario. "riscrivi la
    // scena 1 …" also matches the broader, earlier OHW-041 rewrite scenario
    // (which wins by array order and produces a different scene body + reply);
    // "rifai la scena 1" hits only the 043-B scenario that buffers the cross-page
    // hand-off and emits the "vai sulla pagina Sceneggiatura" hint.
    await sendCesareMessage(
      authenticatedPage,
      "Rifai la scena 1 mettendo Filippo in primo piano",
    );
    await waitForCesareReply(authenticatedPage);

    // The rewrite event fires regardless of page, but the editor isn't
    // mounted on the locations page. Our cross-page handoff buffers the
    // rewrite in sessionStorage so the editor consumes it on next mount.
    const pending = await authenticatedPage.evaluate(() =>
      window.sessionStorage.getItem("ohw:cesare:pending-rewrite"),
    );
    expect(pending).not.toBeNull();
    const parsed = JSON.parse(pending!) as {
      scene_number: number;
      new_content: string;
    };
    expect(parsed.scene_number).toBe(1);
    expect(parsed.new_content).toContain("EXT. SESTO SAN GIOVANNI");

    // The drawer must STAY open on a non-screenplay page so the user can
    // read Cesare's confirmation and navigate manually. (On screenplay
    // page it closes immediately to let the typewriter take over.)
    await expect(
      authenticatedPage.getByText(/vai sulla pagina sceneggiatura/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("[OHW-043-C] from locations page, Cesare describes cross-domain tools when asked", async ({
    authenticatedPage,
  }) => {
    await navigateToLocations(authenticatedPage, LOCATIONS_PROJECT_ID);
    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "che tool hai?");
    // The cross-domain tool list renders as a multi-line markdown reply (one
    // <p> per domain line). `waitForCesareReply` returns only the LAST
    // paragraph, so we wait for it to land and then read the whole assistant
    // conversation text — the tool names we assert on live across several
    // paragraphs, not just the final one.
    await waitForCesareReply(authenticatedPage);
    const reply =
      (await authenticatedPage
        .getByTestId("cesare-conversation")
        .textContent()) ?? "";

    // Reply must mention tools from at least 3 different domains: the whole
    // point of spec 43. The previous per-page implementation would have
    // listed only location tools here.
    const lower = reply.toLowerCase();
    const hasScreenplayTool =
      lower.includes("rewrite_scene") ||
      lower.includes("merge_scenes") ||
      lower.includes("propose_screenplay");
    const hasBudgetTool =
      lower.includes("update_budget") ||
      lower.includes("add_budget") ||
      lower.includes("set_budget_cap");
    const hasLocationTool =
      lower.includes("add_candidate") ||
      lower.includes("search_places") ||
      lower.includes("find_or_create_requirement_for_scene");

    expect(hasScreenplayTool, "reply should mention a screenplay tool").toBe(
      true,
    );
    expect(hasBudgetTool, "reply should mention a budget tool").toBe(true);
    expect(hasLocationTool, "reply should mention a location tool").toBe(true);
  });
});
