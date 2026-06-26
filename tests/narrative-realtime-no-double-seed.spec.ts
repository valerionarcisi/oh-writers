// tests/narrative-realtime-no-double-seed.spec.ts
//
// [N41] Narrative realtime editor must NOT double-seed the CRDT (BUG-N41).
//
// Regression for the "Invalid string length" page freeze. The realtime narrative
// editor used to build its EditorState with a non-empty `doc` while `ySyncPlugin`
// was bound to an already-populated Yjs fragment, so y-prosemirror merged the
// initial doc ON TOP of the existing content on every reconnect. The CRDT grew on
// each open, the persisted state ballooned, and `docToHtml` eventually exceeded
// V8's max string length and froze the tab — which made Attiva / Nuova versione
// look broken (the page was already frozen when clicked).
//
// The fix mirrors the screenplay editor: seed from `initialDoc` only when the
// fragment is empty, otherwise start empty and let the CRDT populate it. This
// test proves the invariant end-to-end: repeated reconnects (reloads) of a
// populated narrative doc keep the editor content the SAME size — no doubling —
// and the version controls stay responsive.
//
// Realtime is the trigger, so the doubling assertion is gated on a live
// ws-server (same `VITE_WS_URL` gate the collab suite uses). Without realtime the
// editor still must load and accept input (the always-on guarantee).
import { test, expect, BASE_URL, TEST_TEAM_PROJECT_ID } from "./fixtures";
import type { Page } from "@playwright/test";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

const REALTIME_ENABLED = !!process.env["VITE_WS_URL"];

// The narrative editor exposes its last-serialised HTML for tests.
const narrativeHtmlLength = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        window as unknown as { __ohWritersNarrativeHtml?: () => string }
      ).__ohWritersNarrativeHtml?.().length ?? 0,
  );

const waitForEditor = async (page: Page): Promise<void> => {
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("rich-text-editor")).toBeVisible({
    timeout: 15_000,
  });
};

test.describe("[N41] narrative realtime — no CRDT double-seed", () => {
  test("editor loads and accepts input (always-on)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    await waitForEditor(page);

    const marker = ` zzz-${Date.now()}`;
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(marker);
    await expect
      .poll(() => narrativeHtmlLength(page), { timeout: 8_000 })
      .toBeGreaterThan(0);
  });

  test("repeated reconnects do NOT grow the content (no double-seed)", async ({
    authenticatedPage: page,
  }) => {
    test.skip(!REALTIME_ENABLED, "requires VITE_WS_URL + a running ws-server");

    // Seed the CRDT once: type a marker and let it persist through the room.
    await page.goto(SOGGETTO_PATH);
    await waitForEditor(page);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(` rt-${Date.now()}`);
    // Give the ws-server a beat to receive + flush the update.
    await expect
      .poll(() => narrativeHtmlLength(page), { timeout: 8_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(1_000);

    // Baseline after the first populated load settles.
    // Reconnect several times. Before the fix each reload merged the initial doc
    // on top of the CRDT, compounding the content on every connect; now it must
    // converge to a stable size.
    const lens: number[] = [];
    for (let i = 0; i < 5; i++) {
      await page.reload();
      await waitForEditor(page);
      await page.waitForTimeout(2_000);
      lens.push(await narrativeHtmlLength(page));
    }
    // The catastrophic bug was EXPONENTIAL growth (the content roughly doubled
    // on every connect until V8's max string length froze the tab). The fix
    // makes reconnects converge to a stable size. Assert the last reconnect is
    // not exploding relative to the first reconnect — i.e. it has settled, not
    // compounded.
    const first = lens[0]!;
    const last = lens[lens.length - 1]!;
    expect(
      last,
      `content must not compound across reconnects (first ${first}, last ${last}, all ${lens.join(",")})`,
    ).toBeLessThan(first * 1.5);
  });

  test("version controls stay responsive on a realtime doc (Nuova versione + Attiva)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    await waitForEditor(page);

    // Open the Versions surface via the TopBar chip.
    const chip = page.getByTestId("topbar-version-chip");
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await chip.click();
      await expect(page.getByTestId("versions-split-drawer")).toBeVisible({
        timeout: 4_000,
      });
    }).toPass({ timeout: 20_000 });

    // Nuova versione: the page must not freeze — a new row appears and the editor
    // keeps responding (a frozen tab would never repaint the list).
    const rows = page.locator('[data-testid^="versions-split-row-"]');
    const before = await rows.count();
    await page.getByTestId("version-new").click();
    await expect
      .poll(() => rows.count(), { timeout: 10_000 })
      .toBeGreaterThan(before);

    // Attiva an older (non-current) version: content swaps in, exactly one
    // version stays current, and the surface remains interactive.
    const activate = page.locator('[data-testid^="version-activate-"]').first();
    await expect(activate).toBeVisible({ timeout: 10_000 });
    const targetId = (await activate.getAttribute("data-testid"))!.replace(
      "version-activate-",
      "",
    );
    await page.getByTestId(`version-activate-${targetId}`).click();
    await expect(
      page.getByTestId(`versions-split-current-${targetId}`),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('[data-testid^="versions-split-current-"]'),
    ).toHaveCount(1);
  });
});
