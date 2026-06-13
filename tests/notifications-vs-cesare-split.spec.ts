// tests/notifications-vs-cesare-split.spec.ts
//
// [BUG · N64 family] Notifications win the single auxiliary lane over Cesare peek.
//
// The shell grid has exactly ONE auxiliary (3rd) track shared by three routed
// surfaces: the Versions lane, the Cesare peek (`?peek=cesare`), and the shell
// preview/notifications SplitDrawer. The lane resolver (AppShell "Single
// auxiliary-lane resolver", BUG-N64) keeps them MUTUALLY EXCLUSIVE so two lanes
// never squeeze the main lane to zero.
//
// Before this fix, the resolver gave the Cesare peek a HIGHER precedence than
// the preview drawer, so clicking the bell while `?peek=cesare` was open
// suppressed the notifications entirely — the panel mounted with no grid track
// behind the Cesare column and "nothing visible" happened. An explicit user
// action (opening notifications) must WIN the lane: opening the bell closes the
// Cesare peek (clears `?peek`) so the track is free and the notifications show.
//
// We assert both halves of the invariant:
//   1. visibility — the notification centre drawer is visible after the click.
//   2. exclusivity — the body never carries two *-split attributes at once.
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

// Count how many of the three auxiliary-lane body flags are set at once. The
// N64 invariant is: at most ONE auxiliary lane track is ever live.
const activeSplitFlags = async (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const d = document.body.dataset;
    const flags: string[] = [];
    if (d.cesareSplit) flags.push("cesare-split");
    if (d.versionsSplit) flags.push("versions-split");
    if (d.previewSplit) flags.push("preview-split");
    return flags;
  });

const openBell = async (page: Page) => {
  await page
    .getByTestId("topbar-account")
    .getByTestId("notifications-btn")
    .click();
};

test.describe("[BUG · N64 family] notifications vs Cesare peek", () => {
  test("clicking the bell with Cesare peek open shows the notifications and yields the lane", async ({
    authenticatedPage: page,
  }) => {
    // Deep-link straight to the split surface (the deterministic, URL-stable
    // way to open the Cesare peek — same as cesare-split-drawer.spec.ts's
    // "deep-link with ?peek=cesare opens already-split").
    await page.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown?peek=cesare`,
    );
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // ── Cesare is open as the split column ───────────────────────────────────
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.cesareSplit ?? ""))
      .toBe("open");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("peek"))
      .toBe("cesare");
    // Sanity: exactly one auxiliary lane is live now (Cesare).
    expect(await activeSplitFlags(page)).toEqual(["cesare-split"]);

    // ── Click the bell — the explicit user action must WIN the lane ──────────
    await openBell(page);

    // The notifications drawer is VISIBLE (the whole point of the click).
    await expect(page.getByTestId("notification-center-drawer")).toBeVisible({
      timeout: 5_000,
    });

    // The Cesare peek ceded the track: `?peek` is cleared and the lane unmounts.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("peek"))
      .toBeNull();
    await expect(page.getByTestId("cesare-peek-lane")).toBeHidden({
      timeout: 5_000,
    });

    // Exclusivity invariant: the body carries the preview-split flag ALONE —
    // never two *-split attributes at once.
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.previewSplit ?? ""))
      .toBe("open");
    expect(await activeSplitFlags(page)).toEqual(["preview-split"]);
  });
});
