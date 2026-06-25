// tests/shell/topbar-cesare-split-fit.spec.ts
//
// [Spec 78 — A1] TopBar must degrade cleanly when Cesare is in split.
//
// With Cesare promoted into the routed split column the main lane compresses
// to ~450-650px. The regression (Spec 78 §A1) was: the TopBar's right cluster
// (version chip + ⋯ + search + bell/avatar/gear) overflowed the right edge of
// the (narrow) main lane — the account icons spilled out from under the lane
// into the Cesare divider — and the left cluster squished instead of
// truncating the breadcrumb.
//
// Invariant under test, at the Cesare-split main-lane width:
//   - every interactive TopBar affordance (hamburger, version chip, ⋯, search,
//     bell, avatar, gear) is visible AND hit-testable (its own element sits on
//     top at its centre — not clipped or covered);
//   - no affordance overflows past the right edge of the TopBar (the main lane);
//   - the left cluster and the right cluster do not overlap.
import { test, expect, BASE_URL } from "../fixtures";
import { TEAM_PROJECT_ID } from "../soggetto/helpers";
import type { Locator, Page } from "@playwright/test";

// Width chosen so the compressed main lane lands in the tight end of the
// Cesare-split band (~400px main lane): with the pre-fix CSS the right cluster
// (gear) overflowed the bar by ~34px here, so this is the width that actually
// discriminates the regression. The rail auto-collapses to give the lane room.
const CESARE_SPLIT_VIEWPORT = { width: 760, height: 860 } as const;

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
// edge. `clipped` is true when the element's own node is NOT the top element at
// its own centre (covered / clipped) — the exact failure the bug produced.
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
  test("left + right clusters degrade cleanly: every action stays visible, hit-testable, and inside the bar", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ ...CESARE_SPLIT_VIEWPORT });

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
    ).toBeLessThan(650);
    expect(mainWidth).toBeGreaterThan(320);

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
    expect(clusterOverlap, "left/right clusters must not overlap").toBe(false);

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
        locator: page.getByTestId("topbar-account").getByTestId("profile-btn"),
      },
      {
        name: "gear",
        locator: page.getByTestId("topbar-account").getByTestId("settings-btn"),
      },
    ];

    for (const { name, locator } of required) {
      await expect(locator, `${name} must be visible`).toBeVisible();
      const p = await probeWithinBar(locator);
      expect(p.visible, `${name} must have a non-zero box`).toBe(true);
      expect(
        p.hitTestable,
        `${name} must be hit-testable (not clipped/covered)`,
      ).toBe(true);
      expect(
        p.overflowPastBar,
        `${name} must not overflow the bar (overflow ${p.overflowPastBar}px)`,
      ).toBeLessThanOrEqual(1);
    }
  });
});
