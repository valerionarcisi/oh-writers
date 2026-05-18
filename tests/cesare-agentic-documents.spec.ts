import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
} from "./helpers/cesare";

/**
 * [Spec 34] Cesare agentic — Documents (synopsis)
 *
 * The user asks Cesare to expand a section of the sinossi. The scripted
 * scenario emits an `expand_section` tool_use; the real executor rewrites the
 * document body and the UI surfaces the "✦ Cesare ha aggiornato la sinossi"
 * toast.
 */
test.describe("[Spec 34] Cesare Agentic — Documents", () => {
  test("[OHW-541] Cesare expands a section via expand_section tool", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/synopsis`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Espandi la sezione Atto II.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    // The mock scenario replies with text containing "aggiornato" so the
    // AppShell toast handler fires.
    expect(reply.toLowerCase()).toMatch(/aggiornato|espan|sezione/);

    await expect(
      authenticatedPage.getByText("✦ Cesare ha aggiornato la sinossi"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
