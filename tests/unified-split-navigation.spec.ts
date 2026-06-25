// tests/unified-split-navigation.spec.ts
//
// [OHW-N78-A6] Unified navigable SplitDrawer host (Spec 78 §A6).
//
// The single auxiliary split track is a NAVIGABLE host shared by the Cesare
// peek, the Versions lane and the Notifiche lane, with browser-like history
// (←/→ arrows in the split header). Opening one surface while another is open
// NAVIGATES within the same lane (pushes the shared history) instead of
// suppressing the other under it (the old BUG-N64 behaviour).
//
// We assert the core unification contract:
//   1. Open Cesare peek → click VERSIONI → Versions shows in the SAME lane with
//      a ← back affordance; `?peek` ceded to `?versions`.
//   2. ← returns to Cesare (peek lane back, `?peek=cesare`).
//   3. → re-navigates forward to Versions.
//   4. The BUG-N64 invariant holds throughout: at most ONE auxiliary lane flag
//      is set, and the main editor track never collapses (> 200px).
//
// Deep-link `?peek=cesare` is the deterministic, URL-stable way to open the
// Cesare peek (same approach as cesare-split-drawer.spec.ts). The Versions chip
// (`topbar-version-chip`) opens the routed Versions surface.
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

// Count how many of the three auxiliary-lane body flags are set at once. The
// N64 invariant: at most ONE auxiliary lane track is ever live.
const activeSplitFlags = async (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const d = document.body.dataset;
    const flags: string[] = [];
    if (d.cesareSplit) flags.push("cesare-split");
    if (d.versionsSplit) flags.push("versions-split");
    if (d.previewSplit) flags.push("preview-split");
    return flags;
  });

const readMainWidth = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const el = document.getElementById("main-content");
    return el ? Math.round(el.getBoundingClientRect().width) : -1;
  });

// The single auxiliary track width — the computed `--split-aux-width` resolved on
// the shell, which every surface (Cesare / Versioni / Notifiche) shares. Read the
// resolved track width off the live grid (last grid-template-columns track) so we
// measure what the user actually sees, not the token string.
const readAuxTrackWidth = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const shell = document.querySelector('[class*="shell"]');
    if (!shell) return -1;
    const cols = getComputedStyle(shell).gridTemplateColumns.split(" ");
    const last = cols[cols.length - 1];
    return last ? Math.round(parseFloat(last)) : -1;
  });

const peekParam = (page: Page): string | null =>
  new URL(page.url()).searchParams.get("peek");
const versionsParam = (page: Page): string | null =>
  new URL(page.url()).searchParams.get("versions");

// The history nav (←/→) lives in WHICHEVER lane currently owns the track, so it
// re-renders (detaches) when navigating. Click until the EXPECTED lane appears:
// a detach mid-click just means a re-render raced us, so we re-locate and retry
// (bounded). `expectTestId` is the lane that must become visible afterwards.
const clickHistoryArrowUntil = async (
  page: Page,
  arrowTestId: string,
  expectTestId: string,
): Promise<void> => {
  const lane = page.getByTestId(expectTestId);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await expect(page.getByTestId(arrowTestId)).toBeVisible({ timeout: 5_000 });
    await page
      .getByTestId(arrowTestId)
      .click({ timeout: 3_000, force: true })
      .catch(() => undefined);
    try {
      await lane.waitFor({ state: "visible", timeout: 2_500 });
      return;
    } catch {
      // Lane not up yet — the click likely lost to a re-render; retry.
    }
  }
  await expect(lane).toBeVisible({ timeout: 5_000 });
};

test.describe("[OHW-N78-A6] unified navigable split host", () => {
  test("Cesare peek → Versioni shares the lane; ←/→ navigate the shared history", async ({
    authenticatedPage: page,
  }) => {
    // ── Open Cesare as the split column (deep-link) ──────────────────────────
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect.poll(() => peekParam(page)).toBe("cesare");
    // Only Cesare owns the track; the main editor lane survives (N64).
    expect(await activeSplitFlags(page)).toEqual(["cesare-split"]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);

    // ── Click VERSIONI — it must NAVIGATE the shared lane, not hide under Cesare ─
    const chip = page.getByTestId("topbar-version-chip");
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await chip.click();

    // Versions now owns the SAME single track; Cesare ceded the URL.
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => versionsParam(page)).not.toBeNull();
    await expect.poll(() => peekParam(page)).toBeNull();
    // N64: exactly one auxiliary lane, main lane still wide.
    expect(await activeSplitFlags(page)).toEqual(["versions-split"]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);

    // The shared history ←/→ control is present (a second content has been
    // shown, so the nav reveals itself). Re-query the arrows after each navigation
    // since the lane (and thus the header that hosts the nav) re-renders.
    await expect(page.getByTestId("split-drawer-back")).toBeVisible({
      timeout: 5_000,
    });
    await page.screenshot({
      path: "test-results/a6-step1-versions-in-lane.png",
      fullPage: false,
    });

    // ── ← returns to Cesare in the SAME lane ─────────────────────────────────
    await clickHistoryArrowUntil(page, "split-drawer-back", "cesare-peek-lane");
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("versions-split-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => peekParam(page)).toBe("cesare");
    await expect.poll(() => versionsParam(page)).toBeNull();
    expect(await activeSplitFlags(page)).toEqual(["cesare-split"]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);
    await page.screenshot({
      path: "test-results/a6-step2-back-to-cesare.png",
      fullPage: false,
    });

    // ── → re-navigates forward to Versioni ───────────────────────────────────
    // The nav re-rendered into the Cesare split header; the retrying click
    // handles the detach as the lane swaps back to Versions.
    await clickHistoryArrowUntil(
      page,
      "split-drawer-forward",
      "versions-split-lane",
    );
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => versionsParam(page)).not.toBeNull();
    await expect.poll(() => peekParam(page)).toBeNull();
    expect(await activeSplitFlags(page)).toEqual(["versions-split"]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);
    await page.screenshot({
      path: "test-results/a6-step3-forward-to-versions.png",
      fullPage: false,
    });
  });

  test("closing the navigable host clears the lane and the routed params", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    // Navigate to Versioni so the history has two entries.
    await page.getByTestId("topbar-version-chip").click();
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });

    // Close the host via the Versions frame × — the WHOLE host closes
    // (shared history cleared AND the routed params dropped).
    await page
      .getByTestId("versions-split-drawer-frame")
      .getByRole("button", { name: /chiudi/i })
      .first()
      .click();

    await expect(page.getByTestId("versions-split-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => versionsParam(page)).toBeNull();
    await expect.poll(() => peekParam(page)).toBeNull();
    // No auxiliary lane remains; main lane is full width.
    expect(await activeSplitFlags(page)).toEqual([]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);
  });

  test("Cesare peek → Notifiche shares the lane; ← returns to Cesare", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    expect(await activeSplitFlags(page)).toEqual(["cesare-split"]);

    // ── Click the bell — notifications PUSH onto the shared history ───────────
    await page
      .getByTestId("topbar-account")
      .getByTestId("notifications-btn")
      .click();
    await expect(page.getByTestId("notification-center-drawer")).toBeVisible({
      timeout: 5_000,
    });
    // Cesare ceded the URL track (its param dropped) but stays in the history.
    await expect.poll(() => peekParam(page)).toBeNull();
    await expect(page.getByTestId("cesare-peek-lane")).toBeHidden({
      timeout: 5_000,
    });
    expect(await activeSplitFlags(page)).toEqual(["preview-split"]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);

    // ── ← returns to Cesare in the SAME lane (the shared history back-step) ───
    await clickHistoryArrowUntil(page, "split-drawer-back", "cesare-peek-lane");
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("notification-center-drawer")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => peekParam(page)).toBe("cesare");
    expect(await activeSplitFlags(page)).toEqual(["cesare-split"]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);
  });

  // ── Refound host: constant width + arrows everywhere + no loop ───────────────
  // The refound SplitDrawer host abstracts ONE constant-width aux column with a
  // header that is the router (←/→ always present) and a content slot. This test
  // locks the three refound invariants the bridge lacked:
  //   (a) the aux column width is IDENTICAL across Cesare / Versioni / Notifiche
  //       (switching surfaces never reflows the page);
  //   (b) the ←/→ history arrows are present on ALL three, including Cesare, even
  //       with a single-item history (the header is the router);
  //   (c) opening the bell while Cesare is active does NOT feedback-loop (no
  //       "Maximum update depth" console error) and the main lane survives.
  test("refound: constant aux width + ←/→ arrows on all three + no loop on bell-while-Cesare", async ({
    authenticatedPage: page,
  }) => {
    // Capture any React "Maximum update depth" loop error for the whole flow.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    // ── Cesare peek: arrows present (single-item history), record the width ───
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    // The header IS the router: the ←/→ arrows render on Cesare too (disabled at
    // a single-item history, but ALWAYS in the DOM). `attached`, not `visible`,
    // because a disabled arrow is faint but present.
    await expect(page.getByTestId("split-drawer-back")).toBeAttached({
      timeout: 5_000,
    });
    await expect(page.getByTestId("split-drawer-forward")).toBeAttached();
    const cesareAuxWidth = await readAuxTrackWidth(page);
    expect(cesareAuxWidth).toBeGreaterThan(200);
    expect(await readMainWidth(page)).toBeGreaterThan(200);

    // ── Versioni: SAME width, arrows present ─────────────────────────────────
    await page.getByTestId("topbar-version-chip").click();
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("split-drawer-back")).toBeAttached();
    const versionsAuxWidth = await readAuxTrackWidth(page);
    expect(versionsAuxWidth).toBe(cesareAuxWidth);
    expect(await readMainWidth(page)).toBeGreaterThan(200);

    // ── ← back to Cesare, then bell → Notifiche: SAME width, NO loop ──────────
    await clickHistoryArrowUntil(page, "split-drawer-back", "cesare-peek-lane");
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await page
      .getByTestId("topbar-account")
      .getByTestId("notifications-btn")
      .click();
    await expect(page.getByTestId("notification-center-drawer")).toBeVisible({
      timeout: 5_000,
    });
    // Cesare ceded the URL track but the column width is unchanged.
    await expect.poll(() => peekParam(page)).toBeNull();
    const notifAuxWidth = await readAuxTrackWidth(page);
    expect(notifAuxWidth).toBe(cesareAuxWidth);
    expect(await readMainWidth(page)).toBeGreaterThan(200);
    // Arrows present on the notifications header too.
    await expect(page.getByTestId("split-drawer-back")).toBeAttached();

    // The whole flow ran without a React update-depth feedback loop.
    const loopErrors = consoleErrors.filter((t) =>
      /Maximum update depth/i.test(t),
    );
    expect(loopErrors).toEqual([]);
  });

  // ── #47/#48/#49 regression: full Cesare↔Versioni↔back↔forward cycle, then the
  // Cesare composer still accepts input (no render-storm / pointer-events death).
  // The earlier test proves the navigation does not loop; THIS one proves the
  // lane stays INTERACTIVE after the cycle — the #49 symptom (input blocked) is
  // its own failure mode that a clean console alone would not catch.
  test("split lane stays interactive (composer accepts input) after a full navigation cycle", async ({
    authenticatedPage: page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    // Cesare peek → Versioni → ← back → → forward → ← back to Cesare.
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId("topbar-version-chip").click();
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await clickHistoryArrowUntil(page, "split-drawer-back", "cesare-peek-lane");
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await clickHistoryArrowUntil(
      page,
      "split-drawer-forward",
      "versions-split-lane",
    );
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await clickHistoryArrowUntil(page, "split-drawer-back", "cesare-peek-lane");

    // ── #49: the Cesare composer inside the lane must accept keystrokes ────────
    const composer = page
      .getByTestId("cesare-peek-lane")
      .getByLabel("Composer Cesare");
    await expect(composer).toBeVisible({ timeout: 5_000 });
    // pointer-events must be live (not trapped by a stale overlay).
    await expect(composer).toBeEnabled();
    await composer.click();
    await composer.fill("regression check");
    await expect(composer).toHaveValue("regression check");
    // Clear it so the test never sends a message (no write to real data).
    await composer.fill("");

    const loopErrors = consoleErrors.filter((t) =>
      /Maximum update depth/i.test(t),
    );
    expect(loopErrors).toEqual([]);
  });
});
