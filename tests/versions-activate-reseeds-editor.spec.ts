// tests/versions-activate-reseeds-editor.spec.ts
//
// [OHW-N72] Activating a narrative version reseeds the CRDT (documents.yjs_state),
// not just the `current_version_id` pointer + content.
//
// BUG-N72 (the narrative twin of the screenplay BUG-N71): "Attiva" moved the
// active pointer + content in the DB but left `documents.yjs_state` — the CRDT
// the REALTIME editor reads — on the previous version's text, so a connected
// editor kept showing the old version after a reload. The fix reseeds the CRDT
// (`activateVersionSet` / blank-version clear in versions.server.ts).
//
// The Playwright stack is non-realtime by contract (no ws-server, N-42), so the
// editor itself can't surface the realtime regression. We assert the CRDT at the
// DB level instead, via the test-only `set-narrative-state?crdt=1` endpoint that
// decodes `documents.yjs_state` back to text. Red on the old code: activating a
// blank version left the CRDT on the previous content.
import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

const openVersionsViaChip = async (page: Page): Promise<string> => {
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 15_000,
  });
  const chip = page.getByTestId("topbar-version-chip");
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await chip.click();
    await expect(page.getByTestId("versions-split-drawer")).toBeVisible({
      timeout: 4_000,
    });
  }).toPass({ timeout: 20_000 });
  return page.evaluate(
    () => new URL(location.href).searchParams.get("versions") ?? "",
  );
};

// Duplicate the document's CURRENT version (same content) and activate the copy.
// `duplicateVersion` runs the same `activateVersionSet` reseed path the bug was
// about, so the activated copy must carry a reseeded CRDT.
const duplicateCurrentVersion = async (
  page: Page,
  versionId: string,
): Promise<string> => {
  const url =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--duplicateVersion_createServerFn_handler?createServerFn`;
  const res = await page.request.post(url, {
    headers: { "Content-Type": "application/json" },
    data: { data: { versionId } },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { result?: { value?: { id?: string } } };
  const id = body.result?.value?.id;
  expect(id, "duplicateVersion returns the new id").toBeTruthy();
  return id as string;
};

// Decode documents.yjs_state → text via the test endpoint.
const readCrdtText = async (page: Page): Promise<string> => {
  const res = await page.request.get(
    `${BASE_URL}/api/test/set-narrative-state` +
      `?projectId=${TEST_TEAM_PROJECT_ID}&type=soggetto&crdt=1`,
  );
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { crdtText?: string };
  return body.crdtText ?? "";
};

test.describe("[OHW-N72] Attiva reseeds the narrative CRDT", () => {
  test("activating a version reseeds the CRDT from its content", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    // Find the current version id from the Versions list.
    await openVersionsViaChip(page);
    const currentRow = page
      .locator('[data-testid^="versions-split-current-"]')
      .first();
    await expect(currentRow).toBeVisible({ timeout: 10_000 });
    const sourceVersionId = (await currentRow.getAttribute(
      "data-testid",
    ))!.replace("versions-split-current-", "");

    // Duplicate the current version + activate the copy. This runs the activate
    // reseed path: the copy's content (non-empty) must be encoded into the
    // document's CRDT. On the old code activate only moved `current_version_id`,
    // so the narrative CRDT (NULL in the E2E seed) was never written and decodes
    // to "".
    await duplicateCurrentVersion(page, sourceVersionId);

    await expect
      .poll(async () => readCrdtText(page), { timeout: 10_000 })
      .not.toBe("");

    // The reseeded CRDT actually encodes the soggetto's content (a stable word
    // from the seed), not some unrelated state.
    const crdt = await readCrdtText(page);
    expect(crdt.toLowerCase()).toContain("marta");
  });
});
