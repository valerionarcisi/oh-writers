// tests/unified-split-navigation.spec.ts
//
// [N78-A6] Unified navigable SplitDrawer host (Spec 78 §A6).
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

// The rendered width of whichever surface currently owns the auxiliary track.
// Measured off the live element rather than the grid template: `[class*="shell"]`
// resolves to different elements between the dev and built bundles (hashed CSS
// Module class names), so reading the template is unreliable outside the specific
// flows above. What the user sees is the lane's own box.
const readAuxLaneWidth = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const lane = document.querySelector(
      '[data-testid="cesare-peek-lane"], [data-testid="versions-split-lane"], [data-testid="notification-center-drawer"]',
    );
    return lane ? Math.round(lane.getBoundingClientRect().width) : -1;
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

test.describe("[N78-A6] unified navigable split host", () => {
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

  // ── #47 regression: opening Versioni while Cesare-split owns the track must
  // not spin the URL ↔ history reconciler. Before the fix, the page-level
  // Versioni toggle preserved `?peek`, creating `?peek=cesare&versions=`
  // coexistence; the reconciler then ping-ponged `?peek=cesare` ⇄ `?versions=`
  // FOREVER (243–383 history mutations + a runaway versions/narrative refetch).
  // A clean console alone did NOT catch it (the churn was history.pushState, not
  // always a surfaced React error in the sample window), so this test INSTRUMENTS
  // the history-mutation count and asserts it settles to a tiny number.
  test("opening Versioni while Cesare-split is active settles (no URL ↔ history ping-pong)", async ({
    authenticatedPage: page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    // Instrument history mutations from this point on.
    await page.evaluate(() => {
      const w = window as unknown as { __navCount: number };
      w.__navCount = 0;
      const ps = history.pushState;
      const rs = history.replaceState;
      history.pushState = function (...a: Parameters<typeof ps>) {
        w.__navCount += 1;
        return ps.apply(this, a);
      };
      history.replaceState = function (...a: Parameters<typeof rs>) {
        w.__navCount += 1;
        return rs.apply(this, a);
      };
    });

    // Click VERSIONI — the exact click that looped.
    await page.getByTestId("topbar-version-chip").click();

    // Versions wins the single track; Cesare ceded its param at the SOURCE
    // (`useRoutedSurface` `conflicts: ["peek"]`), so the two never coexist.
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect.poll(() => versionsParam(page)).not.toBeNull();
    await expect.poll(() => peekParam(page)).toBeNull();
    expect(await activeSplitFlags(page)).toEqual(["versions-split"]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);

    // Let any residual reconciler ticks drain, then assert the URL has STOPPED
    // mutating. A healthy transition is a handful of navigations; the loop was
    // hundreds. The URL must be stable across a settle window.
    const navAfterClick = await page.evaluate(
      () => (window as unknown as { __navCount: number }).__navCount,
    );
    const urlAfterClick = page.url();
    await page.waitForTimeout(1_500);
    const navAfterSettle = await page.evaluate(
      () => (window as unknown as { __navCount: number }).__navCount,
    );
    // No further navigations after the transition settled.
    expect(navAfterSettle).toBe(navAfterClick);
    // And the transition itself was a handful of steps, never the runaway loop.
    expect(navAfterSettle).toBeLessThan(15);
    // The URL is stable on the Versions surface.
    expect(page.url()).toBe(urlAfterClick);

    const loopErrors = consoleErrors.filter((t) =>
      /Maximum update depth/i.test(t),
    );
    expect(loopErrors).toEqual([]);
  });

  // ── BUG-rimbalzo regression: Versioni must NOT bounce back to Cesare ─────────
  // Opening Versioni over an open Cesare peek leaves a render tick where BOTH
  // routed params coexist (`?versions` set before `?peek` clears, or vice-versa).
  // The coexistence guard in `reconcileUrlAction` used to resolve that overlap
  // UNCONDITIONALLY toward Cesare, so the lane flashed Versioni then snapped back
  // to Cesare (`?peek` re-asserted, `?versions` dropped). A plain chip click does
  // NOT open that window (the router batches the param flip atomically), so we
  // drive the exact coexistence state DETERMINISTICALLY via a deep-link carrying
  // BOTH params — the in-flight URL the real gesture produced — and assert the
  // shell converges to Versioni (the active surface), never bouncing to Cesare.
  test("BUG-rimbalzo: opening Versioni over Cesare settles on Versioni, never snaps back to ?peek", async ({
    authenticatedPage: page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    // First reach a real Versions surface to learn this page's `?versions=<id>`
    // (DB-agnostic: the chip opens versions for whatever document the page owns).
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
    await expect.poll(() => versionsParam(page)).not.toBeNull();
    const versionsId = versionsParam(page)!;
    const vcur = new URL(page.url()).searchParams.get("vcur");

    // Now FORCE the coexistence window: deep-link BOTH `?peek=cesare` AND
    // `?versions=<id>` together — the exact in-flight URL the bounce came from.
    const coexistenceUrl = new URL(`${SOGGETTO_PATH}`);
    coexistenceUrl.searchParams.set("peek", "cesare");
    coexistenceUrl.searchParams.set("versions", versionsId);
    if (vcur) coexistenceUrl.searchParams.set("vcur", vcur);
    await page.goto(coexistenceUrl.toString());
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    // The reconciler must converge to ONE surface and STAY there. Versions is the
    // explicit, destructive-adjacent surface the resolver favours when both are
    // deep-linked, so the lane settles on Versioni — and crucially `?peek` does
    // NOT linger or re-appear (the bounce). Either way, never BOTH params at once.
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => peekParam(page)).toBeNull();
    await expect.poll(() => versionsParam(page)).not.toBeNull();
    // N64: exactly one auxiliary lane, main editor track survives.
    expect(await activeSplitFlags(page)).toEqual(["versions-split"]);
    expect(await readMainWidth(page)).toBeGreaterThan(200);

    // The surface must be STABLE — no flash-then-revert. Sample the lane + params
    // across a settle window: `?peek` must never reappear and Versioni must stay.
    const urlAfter = page.url();
    await page.waitForTimeout(1_500);
    await expect(page.getByTestId("versions-split-lane")).toBeVisible();
    expect(peekParam(page)).toBeNull();
    expect(versionsParam(page)).toBe(versionsId);
    expect(page.url()).toBe(urlAfter);

    const loopErrors = consoleErrors.filter((t) =>
      /Maximum update depth/i.test(t),
    );
    expect(loopErrors).toEqual([]);
  });

  // ── Hydration regression: the Cesare resize handle must be SSR-stable ────────
  // `readPersistedSize` used to read localStorage during render, so the resize
  // handle's `aria-valuenow` differed between the server (no localStorage →
  // fallback) and the first client render (restored value), tripping a React
  // hydration mismatch + a size flash on every reload with a peek open. We seed a
  // DIVERGENT persisted size, load `?peek=cesare` fresh, and assert no hydration
  // warning fires.
  test("Cesare peek hydrates cleanly with a divergent persisted drawer size", async ({
    authenticatedPage: page,
  }) => {
    const hydrationWarnings: string[] = [];
    page.on("console", (msg) => {
      // Match the ACTUAL React hydration-mismatch warning, not the SSR payload
      // (`__TSR_SSR__.dehydrated` contains the substring "hydrated"). React phrases
      // it "A tree hydrated but some attributes…didn't match" / "Hydration failed".
      const text = msg.text();
      if (
        (msg.type() === "error" || msg.type() === "warning") &&
        (/tree hydrated but some attributes/i.test(text) ||
          /hydration failed/i.test(text) ||
          /didn't match.*server-rendered/i.test(text) ||
          /aria-valuenow/i.test(text))
      ) {
        hydrationWarnings.push(text);
      }
    });

    // Seed a split drawer size that differs from the 480 SSR fallback, so the
    // restored client value would mismatch the server-rendered handle if the fix
    // regressed. Visit once to get an origin we can write localStorage on.
    await page.goto(`${SOGGETTO_PATH}`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await page.evaluate(() => {
      localStorage.setItem("ohw.drawer.size.split", "573.75");
      localStorage.setItem("ohw.drawer.size.expanded", "640");
    });

    // Hard reload straight into the peek so the handle renders during hydration.
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 8_000,
    });
    // Give hydration a beat to surface any mismatch warning.
    await page.waitForTimeout(800);

    expect(hydrationWarnings).toEqual([]);
  });

  // #57 — the B4 refound unified the aux column to a single constant width, which
  // also made the drag handle a no-op: the resize hook updated state nothing ever
  // painted. Both requirements hold together — ONE width for every surface, and
  // that width is user-draggable. Dragging must move the real grid track, survive
  // a reload, and stay shared across surfaces.
  test("the shared aux width is user-draggable, persisted, and still shared", async ({
    authenticatedPage: page,
  }) => {
    // Pin a known starting width so the drag has room to grow regardless of what
    // an earlier test left in localStorage (the value is shared + persisted).
    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await page.evaluate(() =>
      localStorage.setItem("ohw.split-drawer.width", "420"),
    );

    // Versioni is the surface that owns a lane resize handle (the Cesare peek
    // fills the track without one).
    await page.getByTestId("topbar-version-chip").click();
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 15_000,
    });

    // The lane animates into its track, so poll until the width settles rather
    // than reading mid-transition (a too-early read catches the full-bleed
    // pre-layout box, not the lane).
    await expect
      .poll(async () => readAuxLaneWidth(page), { timeout: 10_000 })
      .toBeLessThan(1_000);
    const initialWidth = await readAuxLaneWidth(page);
    expect(initialWidth).toBeGreaterThan(200);

    // Drag the lane's left edge leftwards by 150px — that widens the aux track.
    // The handle is a transparent 6px strip whose grip only fades in on hover, so
    // Playwright treats it as invisible (the role engine skips it and
    // `boundingBox()` returns null) and react-aria's `useMove` binds POINTER
    // events, which `page.mouse` never emits. It is nonetheless attached and
    // hit-testable, so the gesture is dispatched in-page.
    const dragged = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[class*="handleLeft"]')].find(
        (h) => h.closest('[data-placement="lane"]'),
      );
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + Math.min(300, r.height / 2);
      const ev = (type: string, clientX: number, buttons: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY: y,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons,
        });
      el.dispatchEvent(ev("pointerdown", x, 1));
      for (const dx of [-30, -70, -110, -150]) {
        window.dispatchEvent(ev("pointermove", x + dx, 1));
      }
      window.dispatchEvent(ev("pointerup", x - 150, 0));
      return true;
    });
    expect(dragged).toBe(true);

    // The track GREW — before the fix it stayed pinned at the CSS constant no
    // matter how far the handle was dragged.
    await expect
      .poll(async () => readAuxLaneWidth(page), { timeout: 8_000 })
      .toBeGreaterThan(initialWidth);
    const draggedWidth = await readAuxLaneWidth(page);

    // The new width is persisted, so the next visit restores it. (The hydration
    // path itself is covered by the divergent-persisted-size test above; here we
    // assert the drag actually writes the shared key. The stored value is the
    // track width, a few px wider than the lane's own rendered box.)
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Number(localStorage.getItem("ohw.split-drawer.width")),
          ),
        { timeout: 8_000 },
      )
      .toBeGreaterThan(initialWidth);

    // The dragged width is the ONE shared track width, so switching surfaces never
    // shifts the page (the refound invariant). Asserted on the shared custom
    // property rather than each lane's rendered box: the two surfaces inset their
    // content differently, so their boxes differ by a few px for the same track.
    const trackWidth = await page.evaluate(() =>
      document.body.style.getPropertyValue("--split-aux-user"),
    );
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            document.body.style.getPropertyValue("--split-aux-user"),
          ),
        { timeout: 8_000 },
      )
      .toBe(trackWidth);
    expect(await readMainWidth(page)).toBeGreaterThan(200);
  });
});
