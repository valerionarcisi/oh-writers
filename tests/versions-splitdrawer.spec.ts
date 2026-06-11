// tests/versions-splitdrawer.spec.ts
//
// [OHW-049] Versions in the routed SplitDrawer — routing + compress (Spec 49
// W1 + W2). The diff/compare behaviour these specs once covered was removed in
// Spec 66 (master→detail, ADR-0004); the flow itself is covered by
// versions-master-detail.spec.ts. What remains here is the routing contract.
//
// The Versions surface opens via the ROUTER (`?versions=<documentId>`) on the
// soggetto page: the host page stays mounted and COMPRESSES (the main lane
// reflows narrower) while a real third grid column hosts the version list. ×,
// ESC and browser-back clear `?versions` and restore the host width. A deep-link
// with the param opens already-split. The sad path — a malformed `?versions` —
// is ignored (fail closed): no lane, host alone.
//
// The seed ships a single soggetto version, so tests first create a second via
// the document `createVersionFromScratch` server fn (the deterministic,
// URL-stable way to add a version in-test).
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

const readMainWidth = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const el = document.getElementById("main-content");
    return el ? Math.round(el.getBoundingClientRect().width) : -1;
  });

// Open the routed Versions surface via the TopBar version chip (Spec 66 moved
// Versions out of the ⋯ ActionsMenu into the dedicated `topbar-version-chip`).
// The handler sets `?versions=<docId>`; we read that value back so the caller
// learns the soggetto document id without hardcoding it.
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

// Creates a fresh (empty) version via the document `createVersionFromScratch`
// server fn and returns the new version id (which becomes the current version).
// This is the only deterministic, URL-stable way to add a version in-test; the
// routed drawer itself is read-only in W2.
const createBlankVersion = async (
  page: Page,
  documentId: string,
): Promise<string> => {
  const url =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--createVersionFromScratch_createServerFn_handler?createServerFn`;
  const res = await page.request.post(url, {
    headers: { "Content-Type": "application/json" },
    data: { data: { documentId } },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    result?: { isOk?: boolean; value?: { id?: string } };
  };
  const id = body.result?.value?.id;
  expect(
    id,
    "createVersionFromScratch should return the new version id",
  ).toBeTruthy();

  // Give the new (now current) version distinct content so the "vs current"
  // diff against the seeded "Versione 1" yields intra-line CHANGED rows (the
  // word-level highlights), not just whole-line removals.
  const saveUrl =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--saveVersionContent_createServerFn_handler?createServerFn`;
  const saveRes = await page.request.post(saveUrl, {
    headers: { "Content-Type": "application/json" },
    data: {
      data: {
        versionId: id,
        content:
          "Milano, fine anni Settanta. Carla, quaranta anni, libraia, riapre la bottega di famiglia.",
      },
    },
  });
  expect(saveRes.ok()).toBe(true);
  return id as string;
};

test.describe("[OHW-049] Versions SplitDrawer (routed)", () => {
  test("routed open compresses the host; ×/ESC/back restore it", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    // Deterministic shell state so the rail column width is stable.
    await page.evaluate(() =>
      window.localStorage.setItem("ohw.shell.state", "full"),
    );
    await page.reload();
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    const widthBefore = await readMainWidth(page);
    expect(widthBefore).toBeGreaterThan(0);

    // ── Open via the router (the "Versioni" pill) ──────────────────────────
    const documentId = await openVersionsViaUi(page);
    expect(documentId).not.toBe("");

    await expect
      .poll(() =>
        page.evaluate(() => document.body.dataset.versionsSplit ?? ""),
      )
      .toBe("open");

    const widthSplit = await readMainWidth(page);
    expect(
      widthSplit,
      `Host lane should COMPRESS when the Versions split opens (was ${widthBefore}, now ${widthSplit}).`,
    ).toBeLessThan(widthBefore);
    expect(widthSplit).toBeGreaterThan(0);

    // ── × closes it and restores the host width ────────────────────────────
    await page.getByTestId("versions-split-lane").getByLabel("Chiudi").click();
    await expect(page.getByTestId("versions-split-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          new URL(location.href).searchParams.get("versions"),
        ),
      )
      .toBeNull();
    await expect.poll(() => readMainWidth(page)).toBe(widthBefore);

    // ── ESC closes it ──────────────────────────────────────────────────────
    await openVersionsViaUi(page);
    expect(await readMainWidth(page)).toBeLessThan(widthBefore);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("versions-split-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => readMainWidth(page)).toBe(widthBefore);

    // ── Browser-back closes it (the search param pops) ─────────────────────
    await openVersionsViaUi(page);
    expect(await readMainWidth(page)).toBeLessThan(widthBefore);
    await page.goBack();
    await expect(page.getByTestId("versions-split-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => readMainWidth(page)).toBe(widthBefore);
  });

  test("deep-link with ?versions= opens already-split (master→detail list)", async ({
    authenticatedPage: page,
  }) => {
    // First learn the soggetto document id via the routed open, then add a
    // second version so the list is non-trivial.
    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    const documentId = await openVersionsViaUi(page);
    const newCurrentId = await createBlankVersion(page, documentId);

    // Deep-link straight to the split surface (param already present at load).
    // `vcur` carries the current-version baseline so the "Attuale" flag resolves
    // from the URL alone (deep-linkable).
    await page.goto(
      `${SOGGETTO_PATH}?versions=${documentId}&vcur=${newCurrentId}`,
    );
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.body.dataset.versionsSplit ?? ""),
      )
      .toBe("open");

    // The master→detail list has ≥2 versions, exactly one flagged as current.
    // (The exact count is not asserted: the shared test DB may already hold
    // extra soggetto versions created by sibling specs in the same run.)
    const rows = page.locator('[data-testid^="versions-split-row-"]');
    await expect
      .poll(async () => rows.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    await expect(
      page.locator('[data-testid^="versions-split-current-"]'),
    ).toHaveCount(1);

    // ADR-0004: no diff table on this surface.
    await expect(page.getByTestId("versions-split-diff")).toHaveCount(0);
  });

  test("sad path: a malformed ?versions is ignored (fail closed, no compress)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${SOGGETTO_PATH}?versions=not-a-real-id`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    // No lane, no body flag — the host page renders alone at full width.
    await expect(page.getByTestId("versions-split-lane")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => document.body.dataset.versionsSplit ?? ""),
      )
      .toBe("");
  });

  test("sad path: a foreign-but-valid version id leaks nothing (read-gated)", async ({
    authenticatedPage: page,
  }) => {
    // A shape-valid UUID for a document the user cannot read: the lane mounts
    // (the param parses) but the read-gated server fn returns not-found, so no
    // version content is shown.
    const foreign = "99999999-9999-4999-8999-999999999999";
    await page.goto(`${SOGGETTO_PATH}?versions=${foreign}`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.locator('[data-testid^="versions-split-row-"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("versions-split-list")).toContainText(
      /non trovat/i,
    );
  });

  test("[OHW-049] a bare `?versions=` (empty value) does NOT crash the shell", async ({
    authenticatedPage: page,
  }) => {
    // Regression (audit iter-4 REG-1): `versionsSearchSchema` used `.min(1)`, so
    // an empty `?versions=` failed the `_app` layout route's `validateSearch`,
    // the `user` loader never resolved, and the whole shell crashed with
    // "Cannot destructure 'user'". The schema must be permissive (empty
    // survives) and `parseVersionsPeek` fails closed → host renders alone.
    await page.goto(`${SOGGETTO_PATH}?versions=`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText(
      /Something went wrong|Cannot destructure/i,
    );
    // The host page still renders; no Versions drawer is opened.
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.body.dataset.versionsSplit ?? ""),
      )
      .toBe("");
  });
});
