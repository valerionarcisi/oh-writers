// #92 — activating a version whose content is CANONICAL HTML must reseed the
// narrative CRDT too. Before the fix `yjsStateFromNarrativeContent` bailed to
// null on any content starting with "<", so every HTML write (autosaved rich
// text, a Cesare edit derived from it) silently skipped the reseed and the
// realtime editor kept the stale text — the user-visible "Cesare edit failed"
// report of 2026-07-02.
//
// Same DB-level strategy as versions-activate-reseeds-editor.spec.ts (the
// Playwright stack is non-realtime by contract, N-42): drive the real server
// fns and assert the decoded `documents.yjs_state`. Red on the old code: the
// final activate left the CRDT on the previous plain-text content.
import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import { reseedTestDb } from "./breakdown/helpers";

// Mutator pays (#116): activating the HTML version rewrites the soggetto CRDT
// and leaves extra rows in the shared version list — the alphabetically-next
// versions-activate-reseeds-editor spec then activated the wrong row ([N72]).
test.afterAll(() => {
  reseedTestDb();
});

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;
const HTML_CONTENT =
  "<p>Reseed <strong>HTML</strong> canonico.</p><p>Secondo paragrafo.</p>";

const serverFn = (name: string): string =>
  `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
  `--${name}_createServerFn_handler?createServerFn`;

const callVersionFn = async (
  page: Page,
  name: string,
  data: Record<string, string>,
): Promise<string | null> => {
  const res = await page.request.post(serverFn(name), {
    headers: { "Content-Type": "application/json" },
    data: { data },
  });
  expect(res.ok(), `${name} responds ok`).toBe(true);
  const body = (await res.json()) as { result?: { value?: { id?: string } } };
  return body.result?.value?.id ?? null;
};

const readCrdtText = async (page: Page): Promise<string> => {
  const res = await page.request.get(
    `${BASE_URL}/api/test/set-narrative-state` +
      `?projectId=${TEST_TEAM_PROJECT_ID}&type=soggetto&crdt=1`,
  );
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { crdtText?: string };
  return body.crdtText ?? "";
};

const currentVersionIdViaChip = async (page: Page): Promise<string> => {
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
  const currentRow = page
    .locator('[data-testid^="versions-split-current-"]')
    .first();
  await expect(currentRow).toBeVisible({ timeout: 10_000 });
  return (await currentRow.getAttribute("data-testid"))!.replace(
    "versions-split-current-",
    "",
  );
};

test.describe("[092] Activating an HTML version reseeds the narrative CRDT", () => {
  test("canonical HTML content lands in documents.yjs_state on activate", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const sourceId = await currentVersionIdViaChip(page);

    // Duplicate (the copy becomes current), give the copy CANONICAL HTML
    // content, bounce to the source and back so the final activate runs the
    // reseed path with the HTML content.
    const copyId = await callVersionFn(page, "duplicateVersion", {
      versionId: sourceId,
    });
    expect(copyId).toBeTruthy();
    await callVersionFn(page, "saveVersionContent", {
      versionId: copyId as string,
      content: HTML_CONTENT,
    });
    await callVersionFn(page, "switchToVersion", { versionId: sourceId });
    await callVersionFn(page, "switchToVersion", {
      versionId: copyId as string,
    });

    await expect
      .poll(async () => readCrdtText(page), { timeout: 10_000 })
      .toContain("Reseed HTML canonico.");
    expect(await readCrdtText(page)).toContain("Secondo paragrafo.");
  });
});
