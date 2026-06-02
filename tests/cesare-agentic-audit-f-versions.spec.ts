// tests/cesare-agentic-audit-f-versions.spec.ts
//
// [OHW-audit-F-versions] Three Versions/diff audit fixes (Spec 49 + Spec 47d):
//
//   F-A1 — A bare `?versions=<docId>` deep-link WITHOUT `?vcur=` must still show
//          the "vs current" diff: the baseline falls back to the document's
//          current active version. It must NOT stall on
//          "Seleziona una versione per confrontarla".
//
//   F-M2 — The Versions side-by-side diff must show plain prose, never raw block
//          markup: no `<p>`/`</p>` may leak into any rendered diff cell.
//
//   F-M3 — On a first generation (previous document content empty), Cesare's
//          "Mostra modifiche" must flash the whole new content as green
//          additions — never an empty flash.
//
// Runs in the `mock-ui` Playwright project (MOCK_AI=true) so the F-M3 Cesare
// generation is deterministic. F-A1/F-M2 add a second version through the
// document `createVersionFromScratch` + `saveVersionContent` server fns (the
// only URL-stable way to seed a non-trivial diff in-test; the routed drawer is
// read-only).
import { test, expect, BASE_URL, TEST_TEAM_PROJECT_ID } from "./fixtures";
import type { Page } from "@playwright/test";
import { openCesareSheet, sendCesareMessage } from "./helpers/cesare";

const SOGGETTO_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/soggetto`;

const FROM_SCRATCH_PROJECT_ID = "00000000-0000-4000-a000-000000000010";

// ── Helpers (mirrored from versions-splitdrawer.spec.ts) ─────────────────────

// Open the routed Versions surface via the TopBar "Altre azioni" (⋯) menu so we
// learn the soggetto document id back from `?versions=` without hardcoding it.
const openVersionsViaUi = async (page: Page): Promise<string> => {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const item = page.getByRole("menuitem", { name: "Versioni" });
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
  await expect(page.getByTestId("versions-split-lane")).toBeVisible({
    timeout: 5_000,
  });
  return page.evaluate(
    () => new URL(location.href).searchParams.get("versions") ?? "",
  );
};

// Create a fresh version (becomes the current one) and give it distinct HTML
// content so the "vs current" diff yields word-level CHANGED rows AND exercises
// block markup (`<p>`) on both sides — the F-M2 leak surface.
const createSecondVersion = async (
  page: Page,
  documentId: string,
): Promise<string> => {
  const createUrl =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--createVersionFromScratch_createServerFn_handler?createServerFn`;
  const res = await page.request.post(createUrl, {
    headers: { "Content-Type": "application/json" },
    data: { data: { documentId } },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    result?: { value?: { id?: string } };
  };
  const id = body.result?.value?.id;
  expect(
    id,
    "createVersionFromScratch should return the new version id",
  ).toBeTruthy();

  const saveUrl =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--saveVersionContent_createServerFn_handler?createServerFn`;
  const saveRes = await page.request.post(saveUrl, {
    headers: { "Content-Type": "application/json" },
    data: {
      data: {
        versionId: id,
        content:
          "<p>Milano, fine anni Settanta.</p>" +
          "<p>Carla, quaranta anni, libraia, riapre la bottega di famiglia.</p>",
      },
    },
  });
  expect(saveRes.ok()).toBe(true);
  return id as string;
};

test.describe("[OHW-audit-F-versions] Versions deep-link + clean diff", () => {
  test("[F-A1] a bare ?versions= deep-link (no vcur) shows the vs-current diff", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    const documentId = await openVersionsViaUi(page);
    expect(documentId).not.toBe("");
    await createSecondVersion(page, documentId);

    // Deep-link with NO vcur — the regression: the baseline must default to the
    // document's current active version client-side.
    await page.goto(
      `${SOGGETTO_PATH(TEST_TEAM_PROJECT_ID)}?versions=${documentId}`,
    );
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });

    // The vs-current diff renders immediately…
    const diff = page.getByTestId("versions-split-diff");
    await expect(diff).toBeVisible({ timeout: 10_000 });
    await expect(diff.locator("[data-diff-changed]").first()).toBeVisible({
      timeout: 5_000,
    });

    // …and the dead "Seleziona una versione" prompt must NOT appear.
    await expect(page.getByTestId("versions-split-detail")).not.toContainText(
      "Seleziona una versione per confrontarla",
    );

    // Exactly one row is flagged "Attuale" (the resolved current version).
    await expect(
      page.locator('[data-testid^="versions-split-current-"]'),
    ).toHaveCount(1);
  });

  test("[F-M2] the side-by-side diff shows words, never raw <p> markup", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(SOGGETTO_PATH(TEST_TEAM_PROJECT_ID));
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    const documentId = await openVersionsViaUi(page);
    await createSecondVersion(page, documentId);

    await page.goto(
      `${SOGGETTO_PATH(TEST_TEAM_PROJECT_ID)}?versions=${documentId}`,
    );
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });

    const diff = page.getByTestId("versions-split-diff");
    await expect(diff).toBeVisible({ timeout: 10_000 });

    // The rendered diff text must contain prose words, and NO block markup.
    const diffText = (await diff.innerText()).toLowerCase();
    expect(diffText).toContain("milano");
    expect(diffText).not.toContain("<p>");
    expect(diffText).not.toContain("</p>");
  });
});

test.describe("[OHW-audit-F-versions] first-generation Mostra modifiche", () => {
  test("[F-M3] a first generation flashes the whole new content as green additions", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000);

    // Stand the project at genuine first-write: ONLY the logline has content,
    // the soggetto is EMPTY — so generating it is a `"" → content` apply.
    const res = await page.request.post(
      `${BASE_URL}/api/test/set-narrative-state`,
      {
        data: {
          projectId: FROM_SCRATCH_PROJECT_ID,
          present: ["logline"],
          clearScreenplay: true,
        },
        headers: { "Content-Type": "application/json" },
      },
    );
    expect(res.ok(), "set-narrative-state must succeed").toBe(true);

    await page.goto(SOGGETTO_PATH(FROM_SCRATCH_PROJECT_ID));
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);
    await sendCesareMessage(
      page,
      "Riscrivi il soggetto a partire dalla logline",
    );

    // The canonical agentic trace renders with a "Mostra modifiche" affordance —
    // proof a real apply (and auto-version) happened on a first generation.
    const trace = page.getByTestId("cesare-change-trace");
    await expect(trace).toBeVisible({ timeout: 90_000 });
    const showBtn = trace.getByTestId("cesare-show-changes-btn");
    await expect(showBtn).toBeVisible({ timeout: 10_000 });
    await showBtn.click();

    // The flash appears inside the document. Capture it IMMEDIATELY — it fades in
    // ~2s — and assert it carries GREEN additions, not an empty flash (F-M3).
    const flash = page.getByTestId("cesare-live-diff-inline");
    await expect(flash).toBeVisible({ timeout: 5_000 });
    await expect(flash).toHaveAttribute("data-flash-mode", "mostra");
    await expect(flash.locator('[data-diff-op="add"]').first()).toBeVisible({
      timeout: 2_000,
    });
    // The first-write flash has ONLY additions — nothing pre-existed to delete.
    await expect(flash.locator('[data-diff-op="del"]')).toHaveCount(0);
  });
});
