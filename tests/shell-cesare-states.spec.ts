// tests/shell-cesare-states.spec.ts
//
// [OHW-044-A] Cesare 4-state transitions + editor pixel-stability.
//
// The Cesare drawer cycles closed -> expanded -> peek -> full -> closed.
// The editor's bounding rect width MUST remain identical at every transition.
// If it changes the drawer is reflowing the layout instead of floating, which
// breaks the Notion-style invariant locked in Spec 44.
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";

test.describe("[OHW-044-A] Cesare 4-state transitions", () => {
  test("transitions through every state without reflowing the editor", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

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
    const dock = page.getByTestId("bottom-dock");
    await expect(dock).toBeVisible({ timeout: 5_000 });
    const cesareTrigger = dock.getByTestId("cesare-open-btn");
    await cesareTrigger.click();

    // Cesare opens via the AppShell legacy `cesareOpen` pathway. Body should
    // reflect the new state.
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

    // ── expanded → full (cycle button "↗") ────────────────────────────────
    // The drawer cycles expanded → expanded-split → full. AppShell mirrors
    // expanded-split onto body[data-cesare]="expanded", so we click "↗" until
    // the drawer's own data-state reaches "full".
    await drawer.getByTestId("cesare-expand-btn").first().click();
    await drawer.getByTestId("cesare-expand-btn").first().click();
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            document
              .querySelector('[data-testid="cesare-drawer"]')
              ?.getAttribute("data-state") ?? "",
        ),
      )
      .toBe("full");

    // Notion model: `full` is a larger floating drawer, NOT a fullscreen
    // takeover. The editor must stay visible and keep its bounding width —
    // the drawer is position:fixed and never reflows the layout.
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible();
    const widthFull = await readEditorWidth();
    expect(
      widthFull,
      `Editor width changed when Cesare moved to "full" (${baselineWidth} → ${widthFull}); full must stay a floating drawer.`,
    ).toBe(baselineWidth);
    // The editor's left portion must remain on-screen (drawer is right-anchored
    // and width-capped), so the editor's left edge stays at the viewport left.
    const editorLeft = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="breakdown-page-v2"]');
      return el ? Math.round(el.getBoundingClientRect().left) : -1;
    });
    expect(editorLeft).toBeGreaterThanOrEqual(0);

    // ── full → closed (×) ─────────────────────────────────────────────────
    await drawer.getByTestId("cesare-close-btn").click();
    await expect
      .poll(async () => await page.evaluate(() => document.body.dataset.cesare))
      .toBe("closed");

    const widthAfterClose = await readEditorWidth();
    expect(
      widthAfterClose,
      `Editor width changed after Cesare closed (${baselineWidth} → ${widthAfterClose})`,
    ).toBe(baselineWidth);
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

    await dock.getByTestId("cesare-open-btn").click();
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
