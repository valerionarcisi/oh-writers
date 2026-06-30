import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareWithRetry,
  resetCesareState,
} from "./helpers/cesare";

/**
 * [Spec 44] Cesare agentic — Document generation lands LIVE on the open document
 *
 * Canonical Notion pattern (Image 6): when the user asks Cesare to generate a
 * document, the generated content is applied DIRECTLY to the open document (the
 * editor updates live behind the floating chat) and a version is auto-created
 * under the hood. There is NO "Bozze di Cesare" draft tray. The inline trace
 * offers "Mostra modifiche" (a transient flash); rollback lives in the Versions
 * SplitDrawer, not an inline Annulla (Spec 47e).
 */
test.describe("[Spec 44] Cesare Agentic — Document generation applies live", () => {
  // Spec 51 persists Cesare sessions + document edits; the mock-ui project runs
  // serially against one shared DB. 577 asserts the soggetto editor still
  // holds the seed text before the v2 lands, so each test must start from the
  // seed baseline — reset sessions + restore the narrative docs.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("[575] Cesare applies a generated logline live (no draft tray)", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    const reply = await sendCesareWithRetry(
      authenticatedPage,
      "Genera la logline dalla sceneggiatura.",
    );

    expect(reply.toLowerCase()).toMatch(/logline|aggiornat|applicat/);

    // The legacy draft tray must NOT appear — the edit lands live.
    await expect(
      authenticatedPage.getByTestId("document-draft-banner"),
    ).toHaveCount(0);
  });

  test("[577] Cesare applies a soggetto v2 live to the open editor", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    const editor = authenticatedPage.getByTestId("rich-text-editor");
    await expect(editor).toBeVisible({ timeout: 15_000 });

    await openCesareSheet(authenticatedPage);
    const reply = await sendCesareWithRetry(
      authenticatedPage,
      "Fammi un v2 del soggetto più asciutto.",
    );
    expect(reply.toLowerCase()).toMatch(/soggetto|aggiornat|applicat|modifica/);

    // The seeded soggetto is ~180 words, so a full v2 rewrite is a LARGE edit:
    // per Spec 76 (#36) Cesare ASKS before minting instead of applying silently.
    // Confirm "Nuova versione" → the edit then applies live to the open editor.
    const askCard = authenticatedPage.getByTestId("cesare-ask-new-version");
    await expect(askCard).toBeVisible({ timeout: 30_000 });
    await authenticatedPage.getByTestId("cesare-ask-mint").click();

    // The mock soggetto-v2 output is deterministic ("Marco torna a Falerone…").
    // After confirming, it landed in the open editor — the live-doc contract —
    // not a draft.
    await expect(editor).toContainText("Marco torna a Falerone", {
      timeout: 15_000,
    });
    await expect(
      authenticatedPage.getByTestId("document-draft-banner"),
    ).toHaveCount(0);

    // The inline trace exposes the "Mostra modifiche" flash control — and, per
    // Spec 47e, NO inline "Annulla" (rollback lives in the Versions SplitDrawer).
    const trace = authenticatedPage.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 10_000 });
    await expect(trace.getByTestId("cesare-show-changes-btn")).toBeVisible({
      timeout: 10_000,
    });
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);
  });

  test("[578] Cesare applies a generated scaletta live (no draft tray)", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/outline`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    const reply = await sendCesareWithRetry(
      authenticatedPage,
      "Dato il soggetto fammi la scaletta.",
    );

    expect(reply.toLowerCase()).toMatch(/scaletta|aggiornat|applicat/);

    await expect(
      authenticatedPage.getByTestId("document-draft-banner"),
    ).toHaveCount(0);
  });
});
