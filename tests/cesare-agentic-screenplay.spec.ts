import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
} from "./helpers/cesare";

/**
 * [Spec 34] Cesare agentic — Screenplay propose/accept
 *
 * - OHW-570: propose_screenplay_edit — verbatim find/replace overlay with
 *   ✓/✕ buttons. After ✓ the doc is updated.
 * - OHW-571: propose_screenplay_revision — macro rewrite creates a DRAFT
 *   version and renders a banner with "Apri il diff" + Promuovi / Scarta.
 * - OHW-572: propose_rename_entity — whole-word rename across the doc,
 *   accept-all promotes every occurrence in one transaction.
 */
test.describe("[Spec 34] Cesare Agentic — Screenplay", () => {
  test("[OHW-570] propose_screenplay_edit shows ✓/✕ overlay and applies on accept", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await expect(authenticatedPage.getByTestId("prosemirror-view")).toBeVisible(
      { timeout: 20_000 },
    );

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Rendi questa scena più tesa.");
    const reply = await waitForCesareReply(authenticatedPage);
    expect(reply.toLowerCase()).toMatch(/propost|modifica|scena/);

    // The PM plugin renders a widget with accept/reject buttons next to the
    // matched range. The widget carries data-testid="proposal-accept" /
    // data-testid="proposal-reject" so tests can target them without
    // dependence on visible label.
    const acceptBtn = authenticatedPage
      .locator('[data-testid="proposal-accept"]')
      .first();
    await expect(acceptBtn).toBeVisible({ timeout: 10_000 });

    await acceptBtn.click();

    // After accept, the doc replaces "Si accende una sigaretta." with the
    // proposed string. We assert the new text appears in the editor; the
    // PM mapping was performed client-side.
    await expect
      .poll(
        async () => {
          const fountain = await authenticatedPage.evaluate(
            () =>
              (
                window as unknown as { __ohWritersFountain?: () => string }
              ).__ohWritersFountain?.() ?? "",
          );
          return fountain.includes("le mani che tremano");
        },
        { timeout: 5_000 },
      )
      .toBe(true);
  });

  test("[OHW-571] propose_screenplay_revision creates a DRAFT and shows the banner", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await expect(authenticatedPage.getByTestId("prosemirror-view")).toBeVisible(
      { timeout: 20_000 },
    );

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Fammi una v2 più corta.");
    const reply = await waitForCesareReply(authenticatedPage);
    expect(reply.toLowerCase()).toMatch(/preparat|v2|versione|draft|diff/);

    // The banner appears once the proposals query refetches after Cesare's
    // turn (AppShell.handleCesareAssistantResponse invalidates the query).
    const banner = authenticatedPage.getByTestId("cesare-draft-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });

    const openDiff = authenticatedPage.getByTestId("cesare-draft-banner-open");
    await expect(openDiff).toBeVisible();
    await expect(openDiff).toHaveAttribute("href", /\/versions\//);
  });

  test("[OHW-572] propose_rename_entity decorates every whole-word match", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await expect(authenticatedPage.getByTestId("prosemirror-view")).toBeVisible(
      { timeout: 20_000 },
    );

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Rinomina Giulio in Lucia.");
    const reply = await waitForCesareReply(authenticatedPage);
    expect(reply.toLowerCase()).toMatch(/rinomina|propost/);

    // Bulk-accept the single proposal — the PM plugin replaces every
    // whole-word occurrence in one transaction.
    const acceptBtn = authenticatedPage
      .locator('[data-testid="proposal-accept"]')
      .first();
    await expect(acceptBtn).toBeVisible({ timeout: 10_000 });
    await acceptBtn.click();

    await expect
      .poll(
        async () => {
          const fountain = await authenticatedPage.evaluate(
            () =>
              (
                window as unknown as { __ohWritersFountain?: () => string }
              ).__ohWritersFountain?.() ?? "",
          );
          return fountain.includes("LUCIA");
        },
        { timeout: 5_000 },
      )
      .toBe(true);
  });
});
