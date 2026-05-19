import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
} from "./helpers/cesare";

/**
 * [Spec 29] Cesare agentic — Document auto-generation (propose/accept)
 *
 * The user asks Cesare to generate logline / synopsis / soggetto v2 / scaletta.
 * Each scripted scenario emits a `propose_*` tool_use; the real executor
 * inserts a DRAFT row in document_versions; the UI surfaces a banner above the
 * relevant editor with Compare / Promote / Discard actions.
 */
test.describe("[Spec 29] Cesare Agentic — Document auto-generation", () => {
  test("[OHW-575] Cesare generates a logline draft from the screenplay", async ({
    authenticatedPage,
  }) => {
    // Logline lives in the viewbar pill, not on its own route; the user invokes
    // Cesare from any narrative doc page and the draft is created server-side.
    // We assert on the reply text — the server's invisible `<!--ohw:tools=N-->`
    // marker is non-zero only when the executor inserted a real row.
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

    expect(reply.toLowerCase()).toMatch(/logline|draft|bozza|generat/);
  });

  test("[OHW-576] Cesare generates a synopsis draft from the screenplay", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/synopsis`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(authenticatedPage, "Scrivimi la sinossi.");
    const reply = await waitForCesareReply(authenticatedPage);

    expect(reply.toLowerCase()).toMatch(/sinossi|draft|bozza|generat/);

    await expect(
      authenticatedPage.getByTestId("document-draft-banner"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-577] Cesare proposes a soggetto v2 with an instruction", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Fammi un v2 del soggetto più asciutto.",
    );
    const reply = await waitForCesareReply(authenticatedPage);

    expect(reply.toLowerCase()).toMatch(/soggetto|v2|draft|bozza/);

    await expect(
      authenticatedPage.getByTestId("document-draft-banner"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[OHW-578] Cesare generates a scaletta draft from the soggetto", async ({
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

    expect(reply.toLowerCase()).toMatch(/scaletta|draft|bozza|generat/);

    await expect(
      authenticatedPage.getByTestId("document-draft-banner"),
    ).toBeVisible({ timeout: 10_000 });
  });
});
