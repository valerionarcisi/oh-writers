import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  resetCesareState,
  clearMockContext,
} from "./helpers/cesare";

// Stand the synopsis at a known two-section state (the `set-narrative-state`
// placeholder carries a "## Atto II" heading). This is the precondition for
// expand_section and is pollution-proof: it does not depend on the seed
// baseline surviving whatever ran earlier in the serial suite.
async function seedSynopsisWithSections(
  page: import("@playwright/test").Page,
): Promise<void> {
  const res = await page.request.post(
    `${BASE_URL}/api/test/set-narrative-state`,
    {
      data: { projectId: TEAM_PROJECT_ID, present: ["synopsis"] },
      headers: { "Content-Type": "application/json" },
    },
  );
  expect(res.ok(), "set-narrative-state must succeed").toBe(true);

  // Verify the heading actually landed in the live document BEFORE the test
  // sends the expand request. Without this, a slow CI write races the read and
  // expand_section reports "section not found" — surfacing as a confusing
  // generator-style failure ("non c'era abbastanza materiale"). Read the live
  // content back and assert the "## Atto II" section is present.
  await expect
    .poll(
      async () => {
        const check = await page.request.get(
          `${BASE_URL}/api/test/set-narrative-state?projectId=${TEAM_PROJECT_ID}&type=synopsis`,
        );
        if (!check.ok()) return "";
        const body = (await check.json()) as { content: string };
        return body.content;
      },
      { timeout: 10_000 },
    )
    .toContain("Atto II");
}

/**
 * [Spec 34] Cesare agentic — Documents (synopsis)
 *
 * The user asks Cesare to expand a section of the sinossi. The scripted
 * scenario emits an `expand_section` tool_use; the real executor rewrites the
 * document body and the UI surfaces the "✦ Cesare ha aggiornato la sinossi"
 * toast.
 */
test.describe("[Spec 34] Cesare Agentic — Documents", () => {
  // Spec 51 persists Cesare sessions + document edits; the mock-ui project runs
  // serially against one shared DB, so reset to the seed baseline before each
  // test to keep this spec's writes from leaking into (or out of) its neighbours.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
    // The mock LLM scenario context is a server singleton; a leftover context
    // from an earlier serial test can steer "Espandi la sezione" to a generator
    // scenario instead of expand_section. Clear it so this spec dispatches
    // deterministically.
    await clearMockContext(authenticatedPage);
  });

  test("[OHW-541] Cesare expands a section via expand_section tool", async ({
    authenticatedPage,
  }) => {
    await seedSynopsisWithSections(authenticatedPage);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/synopsis`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Espandi la sezione Atto II.");
    const reply = await waitForCesareReply(authenticatedPage);

    // The mock scenario replies with text containing "aggiornato" so the
    // AppShell toast handler fires.
    expect(reply.toLowerCase()).toMatch(/aggiornato|espan|sezione/);

    await expect(
      authenticatedPage.getByText("✦ Cesare ha aggiornato la sinossi"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
