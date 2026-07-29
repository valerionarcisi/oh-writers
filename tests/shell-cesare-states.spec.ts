// tests/shell-cesare-states.spec.ts
//
// [044-A] Cesare floating-drawer state transitions + editor pixel-stability.
//
// The floating Cesare drawer cycles closed → expanded → peek (→ expanded) →
// closed. The editor's bounding rect width MUST remain identical at every
// transition — if it changes, the drawer is reflowing the layout instead of
// floating, which breaks the Notion-style invariant (Spec 44).
//
// The in-place "full" overlay state was RETIRED: the header ↗ (`cesare-expand-
// btn`) now NAVIGATES to the full-screen session detail route
// (`/projects/:id/sessions/:sessionId`) instead of escalating the floating
// drawer to a "full" overlay. That routing is asserted here in place of the old
// "expanded → full" cycle.
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";
import { openCesareSheet } from "./helpers/cesare";

test.describe("[044-A] Cesare floating-drawer state transitions", () => {
  test("transitions through every state without reflowing the editor; ↗ routes to the session detail", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    // Gate the baseline measurement on shell hydration: the rail column only
    // settles once the hydration effect has written `body[data-shell]`. Reading
    // the editor width before that captures the pre-hydration (rail-less) layout
    // and yields a false "editor reflowed" failure once the rail mounts.
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.shell ?? ""), {
        timeout: 10_000,
      })
      .not.toBe("");
    await page.waitForLoadState("networkidle");

    // Capture the editor's bounding width BEFORE Cesare is opened. This is
    // our reference value — every subsequent state must match it.
    const readEditorWidth = async (): Promise<number> => {
      return await page.evaluate(() => {
        const el = document.querySelector('[data-testid="breakdown-page-v2"]');
        if (!el) return -1;
        return Math.round(el.getBoundingClientRect().width);
      });
    };

    const baselineWidth = await readEditorWidth();
    expect(baselineWidth).toBeGreaterThan(0);

    // ── closed → expanded ─────────────────────────────────────────────────
    await openCesareSheet(page);
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.cesare))
      .toBe("expanded");

    const widthExpanded = await readEditorWidth();
    expect(
      widthExpanded,
      `Editor width changed when Cesare moved to "expanded" (${baselineWidth} → ${widthExpanded})`,
    ).toBe(baselineWidth);

    // ── expanded → peek (via minimize button on the drawer header) ────────
    const drawer = page.getByTestId("cesare-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await drawer.getByTestId("cesare-minimize-btn").click();

    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.cesare))
      .toBe("peek");

    const widthPeek = await readEditorWidth();
    expect(
      widthPeek,
      `Editor width changed when Cesare moved to "peek" (${baselineWidth} → ${widthPeek})`,
    ).toBe(baselineWidth);

    // ── peek → expanded (clicking the peek row cycles back up) ────────────
    // In peek state the peek row exposes its own expand affordance.
    await drawer.getByTestId("cesare-peek-expand-btn").first().click();
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.cesare))
      .toBe("expanded");

    // The editor stayed pixel-stable across the whole floating cycle — the
    // drawer is position:fixed and never reflows the layout.
    const widthBackToExpanded = await readEditorWidth();
    expect(
      widthBackToExpanded,
      `Editor width changed cycling back to "expanded" (${baselineWidth} → ${widthBackToExpanded})`,
    ).toBe(baselineWidth);

    // ── expanded → session detail (header ↗) ──────────────────────────────
    // The ↗ control no longer escalates to an in-place "full" overlay: it
    // navigates to a full-screen central Cesare route and the floating drawer
    // unmounts (`body[data-cesare-surface]` flips to "active"). No message was
    // sent in this test, and since #42 the drawer opens CLEAN — no auto-adopted
    // session — so the empty pending thread expands to its full-page
    // equivalent, the new-session page. (↗ with an active session is covered by
    // cesare-floating-arrow-routes.)
    await drawer.getByTestId("cesare-expand-btn").first().click();
    await page.waitForURL(
      new RegExp(`/projects/${TEAM_PROJECT_ID}/sessions/new$`),
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("new-session-input")).toBeVisible({
      timeout: 10_000,
    });
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.dataset.cesareSurface ?? ""),
      )
      .toBe("active");
  });

  test("shows the BottomDock only when Cesare is closed", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    const dock = page.getByTestId("bottom-dock");
    await expect(dock).toBeVisible();

    await openCesareSheet(page);
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.cesare))
      .toBe("expanded");
    // BottomDock hides when Cesare is open (CSS-controlled via body[data-cesare]).
    // The element may stay in the DOM but be visually hidden / pointer-events:none.
    // We assert it's no longer visually visible.
    await expect(dock).toBeHidden({ timeout: 3_000 });

    // Close again -> dock returns
    await page
      .getByTestId("cesare-drawer")
      .getByTestId("cesare-close-btn")
      .click();
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.cesare))
      .toBe("closed");
    await expect(dock).toBeVisible({ timeout: 3_000 });
  });
});
