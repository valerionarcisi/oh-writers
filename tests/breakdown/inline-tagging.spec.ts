import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToBreakdown,
  openSceneInBreakdown,
  reseedTestDb,
  TEAM_PROJECT_ID,
} from "./helpers";

test.describe("[Spec 10c] Inline scene tagging", () => {
  // The ghost-interaction tests below (284..286) need pristine pending
  // ghosts, but alphabetically-earlier specs (breakdown-bulk-actions confirm /
  // breakdown-dialog-a11y archive) permanently commit them on the shared DB.
  // Reseed once so this file starts from the pristine ghost state.
  test.beforeAll(() => {
    reseedTestDb();
  });

  test("[280] select text → tag as Cast → highlight + chip", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    // dblclick + first-click both struggle to commit a PM TextSelection in
    // headless Chromium. Force the selection via the DOM Range API at the
    // reader level and dispatch selectionchange so PM picks it up.
    const reader = page.getByTestId("readonly-screenplay-view");
    await reader.waitFor({ state: "visible" });
    // ReadOnlyScreenplayView mounts its PM doc in an effect after the wrapper
    // paints, so wait until the body text is actually present before walking it.
    await expect(
      reader.getByText("Filippo", { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await reader.evaluate((root) => {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let cur: Node | null = walk.nextNode();
      while (cur) {
        const t = cur.textContent ?? "";
        const idx = t.indexOf("Filippo");
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(cur, idx);
          range.setEnd(cur, idx + "Filippo".length);
          // Scroll the parent into view so the toolbar (anchored to selection
          // coords) doesn't render off-screen in headless Chromium.
          const parent = cur.parentElement ?? (cur as unknown as HTMLElement);
          parent.scrollIntoView({ block: "center" });
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          return;
        }
        cur = walk.nextNode();
      }
      throw new Error("Filippo text node not located in reader");
    });

    const toolbar = page.getByTestId("selection-toolbar");
    await expect(toolbar).toBeVisible();

    await page.getByTestId("selection-toolbar-cast").click({ force: true });

    // v3 surfaces the new tag as an inline cast highlight over the selected
    // text — there is no longer a side-panel `breakdown-panel` chip (the panel
    // was removed in the redesign), so the inline highlight IS the confirmation
    // that the element was created and applied.
    await expect(
      page.locator('[data-cat="cast"]').filter({ hasText: "Filippo" }).first(),
    ).toBeVisible();
  });

  test("[281] viewer cannot tag (no toolbar)", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    const target = page
      .getByTestId("readonly-screenplay-view")
      .getByText("Filippo", { exact: false })
      .first();
    await target.dblclick();

    await expect(page.getByTestId("selection-toolbar")).toHaveCount(0);
  });

  test("[282] clicking a scene heading navigates to that scene", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // v3 removed the standalone SceneTOC sidebar (`breakdown-toc`). Scene
    // navigation is now driven by clicking a heading inside the reader, which
    // the ScriptReader resolves to the active scene. openSceneInBreakdown
    // performs that v3 interaction; the targeted heading must end up rendered
    // and in view.
    await openSceneInBreakdown(page, 2);

    const headingDom = page.getByTestId("scene-2-heading");
    await expect(headingDom).toBeVisible();
    const box = await headingDom.boundingBox();
    expect(box).not.toBeNull();
  });

  test("[283] stale occurrence renders dimmed", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const staleHighlights = page.locator('[data-stale="true"]');
    const count = await staleHighlights.count();
    if (count > 0) {
      const opacity = await staleHighlights
        .first()
        .evaluate((el) => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeLessThan(1);
    }
  });

  test("[284] ghost suggestion has dashed underline + data-ghost", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    // Pending ghosts are restored by this file's beforeAll reseed (earlier
    // specs bulk-confirm them on the shared DB).
    await openSceneInBreakdown(page, 2);

    const ghost = page.locator('[data-ghost="true"]').first();
    await expect(ghost).toBeVisible();
    const cat = await ghost.getAttribute("data-cat");
    expect(cat).not.toBeNull();
    const occId = await ghost.getAttribute("data-occurrence-id");
    expect(occId).not.toBeNull();
  });

  test("[285] ghost click → popover → Accept becomes highlight", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await openSceneInBreakdown(page, 2);

    const ghost = page.locator('[data-ghost="true"]').first();
    await expect(ghost).toBeVisible();
    const occurrenceId = await ghost.getAttribute("data-occurrence-id");
    expect(occurrenceId).not.toBeNull();

    await ghost.click();
    await expect(page.getByTestId("ghost-popover")).toBeVisible();

    await page.getByTestId("ghost-popover-accept").click();

    await expect(page.getByTestId("ghost-popover")).toHaveCount(0);
    // After accepting, the same range should render as a permanent highlight
    // (data-cat highlight, no longer data-ghost).
    await expect(
      page.locator(`[data-occurrence-id="${occurrenceId}"][data-ghost="true"]`),
    ).toHaveCount(0);
  });

  test("[286] ghost click → popover → Ignore removes ghost", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await openSceneInBreakdown(page, 2);

    const ghost = page.locator('[data-ghost="true"]').first();
    await expect(ghost).toBeVisible();
    const occurrenceId = await ghost.getAttribute("data-occurrence-id");
    expect(occurrenceId).not.toBeNull();

    await ghost.click();
    await expect(page.getByTestId("ghost-popover")).toBeVisible();

    await page.getByTestId("ghost-popover-ignore").click();

    await expect(page.getByTestId("ghost-popover")).toHaveCount(0);
    await expect(
      page.locator(`[data-occurrence-id="${occurrenceId}"][data-ghost="true"]`),
    ).toHaveCount(0);
  });

  // SKIPPED (removed UI, not a testid rename): this asserted that scrolling the
  // reader updates the active item in the SceneTOC sidebar. v3 removed the
  // standalone SceneTOC (`breakdown-toc`) and its dedicated scroll container
  // (`breakdown-script`); the window is now the scroll container and there is no
  // visible "active TOC item" to assert against. The underlying active-scene
  // tracking still runs inside ScriptReader (it drives the RecapStrip), but it
  // no longer has a TOC surface to verify. Re-enable if a scene navigator with
  // an active-item indicator is reintroduced.
  test.skip("[287] reader scroll updates active TOC item", () => {});
});
