import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
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
  test("[OHW-575] Cesare applies a generated logline live (no draft tray)", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Genera la logline dalla sceneggiatura.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    expect(reply.toLowerCase()).toMatch(/logline|aggiornat|applicat/);

    // The legacy draft tray must NOT appear — the edit lands live.
    await expect(
      authenticatedPage.getByTestId("document-draft-banner"),
    ).toHaveCount(0);
  });

  test("[OHW-577] Cesare applies a soggetto v2 live to the open editor", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    const editor = authenticatedPage.getByTestId("rich-text-editor");
    await expect(editor).toBeVisible({ timeout: 15_000 });

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Fammi un v2 del soggetto più asciutto.",
    );
    const reply = await waitForCesareReply(authenticatedPage);
    expect(reply.toLowerCase()).toMatch(/soggetto|aggiornat|applicat/);

    // The mock soggetto-v2 output is deterministic ("Marco torna a Falerone…").
    // Assert it landed in the open editor — the live-doc contract — not a draft.
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
    await expect(
      trace.getByRole("button", { name: "Mostra modifiche" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(trace.getByRole("button", { name: "Annulla" })).toHaveCount(0);
  });

  test("[OHW-578] Cesare applies a generated scaletta live (no draft tray)", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/outline`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Dato il soggetto fammi la scaletta.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    expect(reply.toLowerCase()).toMatch(/scaletta|aggiornat|applicat/);

    await expect(
      authenticatedPage.getByTestId("document-draft-banner"),
    ).toHaveCount(0);
  });
});
