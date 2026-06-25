// tests/shell/topbar-cesare-split-fit.spec.ts
//
// [Spec 78 — A1] TopBar must degrade cleanly when Cesare is in split.
//
// With Cesare promoted into the routed split column the main lane compresses.
// The ORIGINAL A1 regression was: the right cluster (version chip + ⋯ + search +
// bell/avatar/gear) overflowed the right edge of the narrow lane.
//
// The FOLLOW-UP regression (this file's extension) was the OTHER end of the
// band: when the rail is EXPANDED (`data-shell="full"`, the default density) the
// main lane drops to ~340-640px. There the right cluster did NOT shrink — the
// version chip kept its full ~106px box, slid UNDER the search/bell icons and
// became a clipped, NON-hit-testable "VE…" sliver while the icons piled to the
// left. The fix (TopBar.module.css) propagates min-inline-size:0 through the
// chip's descendants so its box truncates cleanly, plus a ≤720px container query
// that tightens the right-cluster gaps. So the chip is the first to truncate and
// the account zone (search · bell · avatar · gear) + ⋯ always stay full-size.
//
// Invariant under test, across the FULL range of Cesare-split main-lane widths
// (rail expanded → the tightest lanes):
//   - every interactive TopBar affordance (hamburger, version chip, ⋯, search,
//     bell, avatar, gear) is visible AND hit-testable (its own element sits on
//     top at its centre — not clipped or covered);
//   - no affordance overflows past the right edge of the TopBar (the main lane);
//   - the left cluster and the right cluster do not overlap.
import { test, expect, BASE_URL } from "../fixtures";
import { TEAM_PROJECT_ID } from "../soggetto/helpers";
import type { Locator, Page } from "@playwright/test";

// Viewports spanning the Cesare-split band. Opening the split AUTO-COLLAPSES the
// rail ONCE (AppShell, Spec 47 A4), so the hamburger lives in the TopBar and the
// main lane is roughly viewport − clamp(360, 42vw, 560) (the peek lane):
//   - 700  → ~340px lane  (tightest — the chip-clip case the fix targets)
//   - 760  → ~400px lane  (tight)
//   - 900  → ~520px lane
//   - 1100 → ~640px lane  (must NOT regress the A1 wide layout)
//   - 1280 → ~742px lane  (wide)
// All five must degrade cleanly. The narrow widths were RED on the old CSS
// (version chip clipped to a non-hit-testable "VE…" sliver under the search
// icon); the wide widths guard against regressing the original A1 layout.
const CESARE_SPLIT_VIEWPORTS = [
  { width: 700, height: 860 },
  { width: 760, height: 860 },
  { width: 900, height: 860 },
  { width: 1100, height: 860 },
  { width: 1280, height: 860 },
] as const;

// Open the floating Cesare drawer, then promote it into the routed split
// column. Mirrors the resilient flow in cesare-split-drawer.spec.ts: the dock
// toggle drives the drawer through a one-render effect, so we retry the dock
// click until the drawer is visible before clicking "open as column".
const openCesareSplit = async (page: Page): Promise<void> => {
  const drawer = page.getByTestId("cesare-drawer");
  await expect(async () => {
    await page
      .getByTestId("bottom-dock")
      .getByTestId("cesare-open-btn")
      .click();
    await expect(drawer).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("Apri come colonna").click();
  await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
    timeout: 5_000,
  });
};

// Geometry + centre hit-test for one element, relative to the TopBar's right
// edge. `hitTestable` is false when the element's own node is NOT the top
// element at its own centre (covered / clipped) — the exact failure the bug
// produced for the version chip.
const probeWithinBar = (target: Locator) =>
  target.evaluate((el) => {
    const bar = el.closest('[data-testid="topstrip"]');
    const barRight = bar ? bar.getBoundingClientRect().right : Infinity;
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return {
      visible: r.width > 0 && r.height > 0,
      hitTestable:
        !!top && (el === top || el.contains(top) || top.contains(el)),
      overflowPastBar: Math.round(r.right - barRight),
    };
  });

test.describe("[Spec 78 A1] TopBar fits the Cesare-split main lane", () => {
  for (const viewport of CESARE_SPLIT_VIEWPORTS) {
    test(`left + right clusters degrade cleanly @ ${viewport.width}px: every action stays visible, hit-testable, and inside the bar`, async ({
      authenticatedPage: page,
    }) => {
      await page.setViewportSize({ ...viewport });

      await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/soggetto`);

      // Wait for the shell + the account zone to mount before driving the dock.
      await expect(page.getByTestId("topbar-account")).toBeVisible({
        timeout: 15_000,
      });
      await expect
        .poll(
          () => page.evaluate(() => document.body.getAttribute("data-shell")),
          { timeout: 10_000 },
        )
        .not.toBeNull();

      // Promote Cesare into the routed split column — direct `?peek=` on a cold
      // load races hydration, so we use the proven drawer affordance.
      await openCesareSplit(page);

      await expect
        .poll(
          () => page.evaluate(() => document.body.dataset.cesareSplit ?? ""),
          {
            timeout: 10_000,
          },
        )
        .toBe("open");

      // ── Sanity: we are genuinely in the compressed Cesare-split band. ──
      const bar = page.getByTestId("topstrip");
      const mainWidth = await bar.evaluate((el) =>
        Math.round(el.getBoundingClientRect().width),
      );
      expect(
        mainWidth,
        `main lane should be a compressed Cesare-split lane (got ${mainWidth})`,
      ).toBeLessThan(820);
      expect(mainWidth).toBeGreaterThan(300);

      // ── The left and right clusters never overlap. ──
      const clusterOverlap = await bar.evaluate((el) => {
        const row = el.querySelector(":scope > div");
        if (!row) return true;
        const left = row.children[0]?.getBoundingClientRect();
        const right =
          row.children[row.children.length - 1]?.getBoundingClientRect();
        if (!left || !right) return true;
        return left.right > right.left + 0.5;
      });
      expect(clusterOverlap, "left/right clusters must not overlap").toBe(
        false,
      );

      // ── Every required affordance is visible, hit-testable, inside the bar. ──
      // The version chip + account icons carry stable testids; the hamburger and
      // search are identified by their (Italian) aria-labels.
      const required: ReadonlyArray<{ name: string; locator: Locator }> = [
        { name: "hamburger", locator: bar.getByLabel("Apri sidebar") },
        {
          name: "version chip",
          locator: page.getByTestId("topbar-version-chip"),
        },
        { name: "⋯ actions", locator: bar.getByLabel("Altre azioni") },
        { name: "search", locator: bar.getByLabel("Cerca ⌘K") },
        {
          name: "bell",
          locator: page
            .getByTestId("topbar-account")
            .getByTestId("notifications-btn"),
        },
        {
          name: "avatar",
          locator: page
            .getByTestId("topbar-account")
            .getByTestId("profile-btn"),
        },
        {
          name: "gear",
          locator: page
            .getByTestId("topbar-account")
            .getByTestId("settings-btn"),
        },
      ];

      for (const { name, locator } of required) {
        await expect(locator, `${name} must be visible`).toBeVisible();
        const p = await probeWithinBar(locator);
        expect(p.visible, `${name} must have a non-zero box`).toBe(true);
        expect(
          p.hitTestable,
          `${name} must be hit-testable (not clipped/covered) @ ${viewport.width}px`,
        ).toBe(true);
        expect(
          p.overflowPastBar,
          `${name} must not overflow the bar (overflow ${p.overflowPastBar}px) @ ${viewport.width}px`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});
