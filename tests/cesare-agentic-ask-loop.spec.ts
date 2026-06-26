// tests/cesare-agentic-ask-loop.spec.ts
//
// [Spec 78 §A5] Large-edit ask card — confirming applies ONCE, no ask-loop.
//
// A large document edit makes Cesare ASK first ([Sovrascrivi] [Nuova versione]).
// Before the §A5 fix, clicking a choice re-sent a confirmation as a USER MESSAGE
// but the document-gen tools re-read the choice from the model's own paraphrased
// tool `instruction`, so a second tool in the turn re-asked and the edit never
// applied ("niente modifica" + re-ask loop). The fix threads the user's turn
// message into the gen tools so the confirmed decision is sticky for the whole
// turn.
//
// This runs in the mock-ui project (MOCK_AI=true). The mock scenario
// "riscrivi a fondo il soggetto a5" routes to propose_soggetto_v2 (the gen-tool
// seam) and ALSO matches the confirm-card re-sends, so the confirm turn re-emits
// the gen tool — exercising the real apply path. We verify the edit applies ONCE
// by the version count (the DB), never by the chat text (which a no-op tool could
// still claim as success).
import { test, expect, BASE_URL, TEST_TEAM_PROJECT_ID } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  openCesareSheet,
  sendCesareMessage,
  waitForCesareReply,
  resetCesareState,
} from "./helpers/cesare";

const SOGGETTO_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/soggetto`;

// A long, distinct soggetto baseline so the mock propose_soggetto_v2 output
// (the "Marco torna a Falerone…" block, fully different words) is a LARGE edit
// (ratio well over 0.4) → Cesare asks before applying.
const LONG_SOGGETTO =
  "<p>In una cittadina di provincia vive una libraia di quartiere che ogni " +
  "mattina alza la saracinesca della bottega ereditata dal padre. Le giornate " +
  "scorrono lente tra clienti abitudinari, scaffali polverosi e il profumo " +
  "della carta vecchia, mentre fuori il mondo cambia senza chiedere permesso. " +
  "Una sera, tra le pagine di un volume mai venduto, trova una lettera che la " +
  "costringe a guardare il proprio passato con occhi nuovi e a decidere se " +
  "restare immobile o partire verso ciò che ha sempre rimandato.</p>";

// Open the routed Versions surface via the TopBar version chip and return the
// soggetto document id.
const openVersionsViaUi = async (page: Page): Promise<string> => {
  const chip = page.getByTestId("topbar-version-chip");
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await chip.click();
  await expect(page.getByTestId("versions-split-lane")).toBeVisible({
    timeout: 5_000,
  });
  return page.evaluate(
    () => new URL(location.href).searchParams.get("versions") ?? "",
  );
};

// Seed the soggetto's active version with the long baseline (the only URL-stable
// way to set arbitrary content), so edit-size classification has a real previous
// content to diff against.
const seedLongSoggetto = async (page: Page): Promise<string> => {
  await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 15_000,
  });
  const documentId = await openVersionsViaUi(page);
  expect(documentId).not.toBe("");

  const createUrl =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--createVersionFromScratch_createServerFn_handler?createServerFn`;
  const created = await page.request.post(createUrl, {
    headers: { "Content-Type": "application/json" },
    data: { data: { documentId } },
  });
  expect(created.ok()).toBe(true);
  const body = (await created.json()) as {
    result?: { value?: { id?: string } };
  };
  const versionId = body.result?.value?.id;
  expect(versionId).toBeTruthy();

  const saveUrl =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--saveVersionContent_createServerFn_handler?createServerFn`;
  const saved = await page.request.post(saveUrl, {
    headers: { "Content-Type": "application/json" },
    data: { data: { versionId, content: LONG_SOGGETTO } },
  });
  expect(saved.ok()).toBe(true);
  return documentId;
};

// Read the version count from the routed Versions list — the HONEST signal the
// spec requires (the DB, never the chat text). Navigate to the versions surface,
// wait for the list to hydrate (at least one row), then count the rows. A small
// settle wait avoids reading mid-hydration (the list is seeded with ≥1 row).
const versionRowCount = async (
  page: Page,
  documentId: string,
): Promise<number> => {
  await page.goto(
    `${SOGGETTO_PATH(TEST_TEAM_PROJECT_ID)}?versions=${documentId}`,
  );
  await expect(page.getByTestId("versions-split-lane")).toBeVisible({
    timeout: 10_000,
  });
  const rows = page.locator('[data-testid^="versions-split-row-"]');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  return rows.count();
};

test.describe("[Spec 78 §A5] Large-edit confirm applies once (no ask-loop)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEST_TEAM_PROJECT_ID);
  });

  test("[N66] clicking 'Nuova versione' applies the edit ONCE and shows the result", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    const documentId = await seedLongSoggetto(page);

    // Baseline version count (the DB-truth signal). Read via the routed list.
    const countBefore = await versionRowCount(page, documentId);

    // 1) A large edit → Cesare ASKS (renders the [Sovrascrivi][Nuova versione]
    //    card). Nothing is applied yet.
    await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await openCesareSheet(page);
    await sendCesareMessage(page, "Riscrivi a fondo il soggetto A5");
    await waitForCesareReply(page);

    const card = page.getByTestId("cesare-ask-new-version");
    await expect(card).toBeVisible({ timeout: 30_000 });
    const mint = page.getByTestId("cesare-ask-mint");
    await expect(mint).toBeVisible();

    // 2) Click [Nuova versione] → the edit must APPLY (not re-ask). The original
    //    ask card stays in the transcript as history, but NO SECOND ask card is
    //    stacked — the loop bug would emit another one.
    await mint.click();
    await waitForCesareReply(page);

    // Exactly ONE ask card total — the historical one. A re-ask would make it 2.
    await expect(page.getByTestId("cesare-ask-new-version")).toHaveCount(1);
    // The honest result card is shown (the entity was actually written).
    await expect(
      page.getByRole("article", { name: /Aggiornato Soggetto/i }),
    ).toBeVisible({ timeout: 15_000 });

    // 3) The edit was applied EXACTLY ONCE — proven by the DB version count, not
    //    the chat text. A confirmed mint inserts exactly one new version row.
    const countAfter = await versionRowCount(page, documentId);
    expect(countAfter).toBe(countBefore + 1);
  });
});
