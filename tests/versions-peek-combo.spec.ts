// tests/versions-peek-combo.spec.ts
//
// [OHW-N64] FAIL-CLOSED arbitration of the routed auxiliary surfaces.
//
// The shell grid reserves ONE auxiliary track beside the main lane, but the
// URL can claim two routed surfaces at once (`?versions=…&peek=cesare`) — a
// stale param surviving a later open, or a hostile deep link. Before the fix
// both lanes mounted, the fourth grid child wrapped to an implicit row
// off-viewport and the page broke (BUG-N64 blank main lane).
//
// Contract under test (routed-surface-arbitration.ts):
//   - exactly ONE auxiliary surface wins (versions > cesare-peek);
//   - the loser is CLOSED: its lane never mounts and its params are stripped
//     from the URL (replace);
//   - the MAIN lane never unmounts — the editor stays visible and sized for
//     every param combination. No combo may blank the page.
import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

interface ShellProbe {
  search: string;
  cesareLanes: number;
  versionsLaneVisible: boolean;
  mainWidth: number;
  mainHeight: number;
  hostVisible: boolean;
  versionsLaneInViewport: boolean;
}

// One DOM read for everything the contract asserts: which lanes mounted,
// whether the versions lane actually sits in the viewport (the bug wrapped it
// to an implicit grid row BELOW the fold), and that the main lane kept real
// geometry (never blanked).
const probeShell = (page: Page): Promise<ShellProbe> =>
  page.evaluate(() => {
    const main = document.getElementById("main-content");
    const mainRect = main?.getBoundingClientRect();
    const versionsLane = document.querySelector(
      '[data-testid="versions-split-lane"]',
    );
    const laneRect = versionsLane?.getBoundingClientRect();
    return {
      search: location.search,
      cesareLanes: document.querySelectorAll('[data-testid="cesare-peek-lane"]')
        .length,
      versionsLaneVisible: versionsLane !== null,
      mainWidth: mainRect ? Math.round(mainRect.width) : -1,
      mainHeight: mainRect ? Math.round(mainRect.height) : -1,
      hostVisible:
        document.querySelector('[data-testid="soggetto-page"]') !== null,
      versionsLaneInViewport:
        laneRect != null &&
        laneRect.top < window.innerHeight &&
        laneRect.width > 0 &&
        laneRect.top >= 0,
    };
  });

// Learn the soggetto document id + current version id from the app itself
// (the seed generates fresh UUIDs every reset, so they cannot be hardcoded):
// the TopBar version chip opens the routed surface and writes both to the URL.
const learnVersionsParams = async (
  page: Page,
): Promise<{ documentId: string; currentVersionId: string | null }> => {
  await page.goto(SOGGETTO_PATH);
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 15_000,
  });
  const chip = page.getByTestId("topbar-version-chip");
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await chip.click();
  await expect(page.getByTestId("versions-split-lane")).toBeVisible({
    timeout: 5_000,
  });
  return page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    return {
      documentId: params.get("versions") ?? "",
      currentVersionId: params.get("vcur"),
    };
  });
};

const expectVersionsWonAndPageAlive = async (page: Page): Promise<void> => {
  // The loser (cesare peek) is closed AND its param is stripped (replace).
  await expect
    .poll(() =>
      page.evaluate(() => new URL(location.href).searchParams.get("peek")),
    )
    .toBeNull();

  const probe = await probeShell(page);
  expect(probe.hostVisible, "main lane must never unmount").toBe(true);
  expect(probe.mainWidth, "main lane must keep real width").toBeGreaterThan(
    300,
  );
  expect(probe.mainHeight).toBeGreaterThan(300);
  expect(probe.cesareLanes, "exactly one aux surface: peek closed").toBe(0);
  expect(probe.versionsLaneVisible, "versions lane wins").toBe(true);
  expect(
    probe.versionsLaneInViewport,
    "versions lane must sit in the viewport (not wrapped to an implicit grid row)",
  ).toBe(true);
};

test.describe("[OHW-N64] routed-surface combo never blanks the page", () => {
  test("deep link with versions+vcur+peek=cesare → versions wins, editor stays", async ({
    authenticatedPage: page,
  }) => {
    const { documentId, currentVersionId } = await learnVersionsParams(page);
    expect(documentId).not.toBe("");

    const vcur = currentVersionId ? `&vcur=${currentVersionId}` : "";
    await page.goto(
      `${SOGGETTO_PATH}?versions=${documentId}${vcur}&peek=cesare`,
    );
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expectVersionsWonAndPageAlive(page);
  });

  test("deep link with versions+peek=cesare (no vcur) → versions wins, editor stays", async ({
    authenticatedPage: page,
  }) => {
    const { documentId } = await learnVersionsParams(page);
    expect(documentId).not.toBe("");

    await page.goto(`${SOGGETTO_PATH}?versions=${documentId}&peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expectVersionsWonAndPageAlive(page);
  });

  test("invalid versions + peek=cesare → versions claim fails closed, cesare lane wins", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${SOGGETTO_PATH}?versions=not-a-uuid&peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    const probe = await probeShell(page);
    expect(probe.hostVisible).toBe(true);
    expect(probe.mainWidth).toBeGreaterThan(300);
    expect(probe.cesareLanes).toBe(1);
    expect(
      probe.versionsLaneVisible,
      "junk versions param mounts no lane",
    ).toBe(false);
  });

  test("opening Versions while the Cesare peek is open closes the peek (interactive)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    const chip = page.getByTestId("topbar-version-chip");
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await chip.click();

    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expectVersionsWonAndPageAlive(page);
  });
});
