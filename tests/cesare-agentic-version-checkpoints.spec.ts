// tests/cesare-version-checkpoints.spec.ts
//
// [OHW-N66] Spec 76 — Cesare version checkpoints (overwrite-by-default,
// mint-on-large). Runs in the mock-ui project (MOCK_AI=true) so the edit sizes
// are deterministic (the mock scenarios do scripted find/replace of a known
// length, see _mocks/cesare-tool-loop.mock.ts).
//
//   [OHW-N66] small edit overwrites  — two small edits leave ONE working entry
//                                       under one checkpoint, not new rows.
//   [OHW-N66] large edit asks         — a large rewrite renders the
//                                       [Sovrascrivi] [Nuova versione] card.
//   [OHW-N66] explicit nuova versione — phrasing it as a new version skips the
//                                       ask and mints directly.
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

// A long soggetto baseline. It contains BOTH mock anchor phrases:
//   "libraio di quartiere" → the small-edit scenario swaps one word
//   "PRINCIPIO"            → the large-edit scenario replaces it with a long body
// The length makes the one-word swap a genuinely SMALL change (under the 0.4
// ratio), so commitOrAsk resolves it to an in-place overwrite.
const LONG_SOGGETTO =
  "<p>PRINCIPIO. In una cittadina di provincia vive un libraio di quartiere " +
  "che ogni mattina alza la saracinesca della bottega ereditata dal padre. " +
  "Le giornate scorrono lente tra clienti abitudinari, scaffali polverosi e " +
  "il profumo della carta vecchia, mentre fuori il mondo cambia senza chiedere " +
  "permesso. Una sera, tra le pagine di un volume mai venduto, trova una lettera " +
  "che lo costringe a guardare il proprio passato con occhi nuovi e a decidere " +
  "se restare immobile o partire verso ciò che ha sempre rimandato.</p>";

// Seed the soggetto's active version with the long baseline, so the edit-size
// classification has a real previous content to diff against. Uses the document
// version server fns directly (the only URL-stable way to set arbitrary content).
const seedLongSoggetto = async (page: Page): Promise<void> => {
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
};

// Open the routed Versions surface via the TopBar version chip (Spec 66 moved
// Versions out of the ⋯ ActionsMenu) and return the soggetto document id.
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

// Count the rows in the Versions list (each list entry, collapsed).
const countVersionRows = async (page: Page): Promise<number> =>
  page.locator('[data-testid^="versions-split-row-"]').count();

test.describe("[OHW-N66] Cesare version checkpoints", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEST_TEAM_PROJECT_ID);
  });

  test("[OHW-N66] small edit overwrites the working version (no flood)", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000);
    await seedLongSoggetto(page);

    await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    const documentId = await openVersionsViaUi(page);
    const rowsBefore = await countVersionRows(page);

    // Two consecutive small edits in the same Cesare session.
    await openCesareSheet(page);
    await sendCesareMessage(page, "Piccola modifica N66: cambia libraio");
    await waitForCesareReply(page);
    await sendCesareMessage(page, "Piccola modifica N66: cambia libraio");
    await waitForCesareReply(page);

    // Reopen the versions list and assert it did NOT grow by two rows. The first
    // overwrite mints ONE checkpoint + seeds a working row (collapsed to one
    // visible entry); the second overwrites in place — no third row.
    await page.goto(
      `${SOGGETTO_PATH(TEST_TEAM_PROJECT_ID)}?versions=${documentId}`,
    );
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    const rowsAfter = await countVersionRows(page);
    // At most ONE new top-level entry (the checkpoint), never two — the working
    // edits collapse rather than flooding the list.
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore + 1);
  });

  test("[OHW-N66] large edit renders the [Sovrascrivi][Nuova versione] card", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000);
    await seedLongSoggetto(page);

    await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    await openCesareSheet(page);
    await sendCesareMessage(page, "Grande modifica N66: riscrivi tutto");
    await waitForCesareReply(page);

    // The ask card renders with both choices; nothing was applied yet.
    const card = page.getByTestId("cesare-ask-new-version");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("cesare-ask-overwrite")).toBeVisible();
    await expect(page.getByTestId("cesare-ask-mint")).toBeVisible();
  });

  test("[OHW-N66] explicit 'nuova versione' skips the ask", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000);
    await seedLongSoggetto(page);

    await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    await openCesareSheet(page);
    // Even though the edit is large, pre-stating "fanne una nuova versione"
    // fires precedence rule 1 → mint directly, so the ask card never appears.
    await sendCesareMessage(
      page,
      "Grande modifica N66: fanne una nuova versione e riscrivi tutto",
    );
    await waitForCesareReply(page);

    // No ask card — the edit was applied as a new version directly.
    await expect(page.getByTestId("cesare-ask-new-version")).toHaveCount(0);
  });
});
