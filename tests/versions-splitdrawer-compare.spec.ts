// tests/versions-splitdrawer-compare.spec.ts
//
// [OHW-049] Versions SplitDrawer — W3 Confronta (2-version side-by-side) and W4
// per-page rollout (Spec 49).
//
// W3: the routed Versions drawer has two modes, switched by a segmented control.
// "Vs attuale" (default) shows the selected version vs the current one; the new
// "Confronta" mode lets the user pick ANY two versions and renders them
// side-by-side (old | new) with word-level diff. The picked pair is reflected in
// the URL as `?compare=<a>,<b>`, so the comparison is deep-linkable.
//
// W4: the same routed drawer is mounted on every document-versioned page —
// soggetto (W2) plus synopsis, outline, treatment — via the shared `⋯` actions
// "Versioni" entry. Opening it COMPRESSES the host lane (the Notion side-peek
// model). Screenplay has its OWN separate versioning surface (dedicated
// /versions + /diff routes, not a `documents` entity) and is intentionally not
// wired to this document-based drawer.
//
// The seed ships a single version per document, so the compare tests first add a
// second version through the document `createVersionFromScratch` +
// `saveVersionContent` server fns (the only deterministic, URL-stable way to add
// a version in-test) before exercising the 2-up compare.
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

const projectPath = (segment: string): string =>
  `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/${segment}`;

const readMainWidth = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const el = document.getElementById("main-content");
    return el ? Math.round(el.getBoundingClientRect().width) : -1;
  });

// Open the routed Versions surface via the TopBar "Altre azioni" (⋯) menu →
// "Versioni". The handler sets `?versions=<docId>`; we read that value back so
// the caller learns the page's document id without hardcoding it.
const openVersionsViaUi = async (page: Page): Promise<string> => {
  const trigger = page.getByLabel("Altre azioni").first();
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

// Create a fresh (empty) version via the document `createVersionFromScratch`
// server fn, then give it distinct content via `saveVersionContent` so the diff
// against the seeded version yields real change rows. Returns the new version id
// (which becomes the current version).
const createVersionWithContent = async (
  page: Page,
  documentId: string,
  content: string,
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
    result?: { isOk?: boolean; value?: { id?: string } };
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
    data: { data: { versionId: id, content } },
  });
  expect(saveRes.ok()).toBe(true);
  return id as string;
};

// The W3 compare tests add versions to the SYNOPSIS document (not soggetto) so
// they never pollute the soggetto version count the W2 spec asserts on — keeping
// the two OHW-049 specs isolated when they share a worker + DB.
const COMPARE_SEGMENT = "synopsis";
const comparePath = projectPath(COMPARE_SEGMENT);

test.describe("[OHW-049] Versions SplitDrawer — W3 Confronta", () => {
  test("select two versions → side-by-side diff visible; URL carries ?compare", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(comparePath);
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 15_000,
    });

    // Learn the document id via the routed open, then add two versions whose
    // content shares structure but differs word-for-word, so the side-by-side
    // diff between THEM yields intra-line CHANGED segments (the word highlights),
    // not just whole-line add/remove.
    const documentId = await openVersionsViaUi(page);
    const created: string[] = [];
    created.push(
      await createVersionWithContent(
        page,
        documentId,
        "Milano, fine anni Settanta. Carla riapre la bottega di famiglia.",
      ),
    );
    created.push(
      await createVersionWithContent(
        page,
        documentId,
        "Milano, primi anni Ottanta. Carla vende la bottega di famiglia.",
      ),
    );

    // Re-open on a fresh load so all three versions are listed.
    await page.goto(comparePath);
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 15_000,
    });
    await openVersionsViaUi(page);

    const rows = page.locator('[data-testid^="versions-split-row-"]');
    await expect(rows).toHaveCount(3, { timeout: 10_000 });

    // Switch to Confronta mode via the segmented control.
    await page.getByTestId("segmented-compare").click();
    // The detail prompts for a (second) version while the pair is incomplete.
    await expect(
      page.getByTestId("versions-split-compare-prompt"),
    ).toBeVisible();

    // Pick the two crafted versions (by their ids) → exactly two picks, with a
    // word-level diff between them.
    await page.getByTestId(`versions-split-row-${created[0]}`).click();
    await page.getByTestId(`versions-split-row-${created[1]}`).click();

    // Two pick badges (A / B) appear and the side-by-side diff renders.
    await expect(
      page.locator('[data-testid^="versions-split-pick-"]'),
    ).toHaveCount(2, { timeout: 5_000 });
    const diff = page.getByTestId("versions-split-diff");
    await expect(diff).toBeVisible();
    await expect(diff.locator("[data-diff-changed]").first()).toBeVisible({
      timeout: 5_000,
    });

    // The URL now carries ?compare=<a>,<b> (deep-linkable). The param is written
    // via a replace navigation, so poll until it lands.
    await expect
      .poll(() =>
        page.evaluate(
          () => new URL(location.href).searchParams.get("compare") ?? "",
        ),
      )
      .toMatch(/^[0-9a-f-]{36},[0-9a-f-]{36}$/i);
  });

  test("?compare=A,B deep-links straight into the side-by-side compare", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(comparePath);
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 15_000,
    });
    const documentId = await openVersionsViaUi(page);

    // Read the seeded version id from the list, then add a 2nd with distinct
    // content so we have a concrete A,B pair to deep-link.
    const firstRowTestId = await page
      .locator('[data-testid^="versions-split-row-"]')
      .first()
      .getAttribute("data-testid");
    const versionA = (firstRowTestId ?? "").replace("versions-split-row-", "");
    expect(versionA).not.toBe("");
    const versionB = await createVersionWithContent(
      page,
      documentId,
      "Una storia completamente diversa, ambientata a Napoli nel 1999.",
    );

    // Deep-link straight to the compare surface.
    await page.goto(
      `${comparePath}?versions=${documentId}` +
        `&compare=${versionA},${versionB}`,
    );
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });

    // The Confronta segment is active and the 2-up diff renders from the URL
    // alone (no manual picks). The SegmentedControl is a react-aria radio group,
    // so the active option carries `checked` / `aria-checked`, not aria-selected.
    await expect(page.getByTestId("segmented-compare")).toBeChecked();
    await expect(
      page.locator('[data-testid^="versions-split-pick-"]'),
    ).toHaveCount(2, { timeout: 5_000 });
    const diff = page.getByTestId("versions-split-diff");
    await expect(diff).toBeVisible();
    await expect(diff.locator("[data-diff-changed]").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("sad path: a malformed ?compare is ignored — stays in vs-current", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(comparePath);
    await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
      timeout: 15_000,
    });
    const documentId = await openVersionsViaUi(page);

    // A single id (not a pair) and a same-version pair are both fail-closed: the
    // drawer opens but stays in the default "vs current" mode (segment active),
    // never an open compare on junk.
    await page.goto(`${comparePath}?versions=${documentId}&compare=not-a-pair`);
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("segmented-current")).toBeChecked();
    await expect(
      page.locator('[data-testid^="versions-split-pick-"]'),
    ).toHaveCount(0);
  });
});

test.describe("[OHW-049] Versions SplitDrawer — W4 per-page rollout", () => {
  // Every document-versioned page opens the SAME routed drawer and COMPRESSES
  // the host lane. Screenplay is intentionally excluded (separate versioning).
  for (const segment of ["synopsis", "outline", "treatment"]) {
    test(`${segment}: Versioni opens the routed drawer + compresses the host`, async ({
      authenticatedPage: page,
    }) => {
      await page.goto(projectPath(segment));
      await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
        timeout: 15_000,
      });

      // Deterministic shell state so the host width is stable.
      await page.evaluate(() =>
        window.localStorage.setItem("ohw.shell.state", "full"),
      );
      await page.reload();
      await expect(page.getByTestId("narrative-docs-shell")).toBeVisible({
        timeout: 15_000,
      });

      const widthBefore = await readMainWidth(page);
      expect(widthBefore).toBeGreaterThan(0);

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
        `${segment} host lane should COMPRESS when Versions opens ` +
          `(was ${widthBefore}, now ${widthSplit}).`,
      ).toBeLessThan(widthBefore);
      expect(widthSplit).toBeGreaterThan(0);

      // × restores the host width.
      await page
        .getByTestId("versions-split-lane")
        .getByLabel("Chiudi")
        .click();
      await expect(page.getByTestId("versions-split-lane")).toBeHidden({
        timeout: 5_000,
      });
      await expect.poll(() => readMainWidth(page)).toBe(widthBefore);
    });
  }
});
