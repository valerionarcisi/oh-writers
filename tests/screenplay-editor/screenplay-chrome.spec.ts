/**
 * Spec 55a — Screenplay editor chrome (N-18 + N-19).
 *
 * N-18: the centered screenplay page has no white card frame — the editor
 *       slot drops its border/radius/background and the page shell drops its
 *       shadow, leaving only the text page on the canvas.
 * N-19: the element-type tabs are a react-aria toolbar with roving arrow-key
 *       focus, and export PDF / export Fountain / import PDF / import Fountain
 *       / Versioni all live in the single TopBar actions menu.
 */

import type { Page } from "@playwright/test";
import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL, waitForEditor } from "../helpers";

const SCREENPLAY_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/screenplay`;

const ELEMENT_ORDER = [
  "scene",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
] as const;

const openScreenplayActions = async (page: Page): Promise<void> => {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await expect(page.getByTestId("screenplay-actions-menu")).toBeVisible({
    timeout: 5_000,
  });
};

test.describe("[Spec 55a] screenplay chrome", () => {
  test("N-18 — the page has no card frame around the editor", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    const editor = await waitForEditor(page);

    // The ProseMirror page sits inside `.pageShell`; assert it carries no
    // border and no box-shadow (the white frame the user flagged).
    const pageShell = editor.locator("xpath=ancestor::*[1]");
    const frame = await pageShell.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        borderTopWidth: cs.borderTopWidth,
        boxShadow: cs.boxShadow,
      };
    });
    expect(frame.borderTopWidth).toBe("0px");
    expect(frame.boxShadow).toBe("none");
  });

  test("N-19 — element tabs are a roving-focus react-aria toolbar", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    const toolbar = page.getByRole("toolbar", { name: /blocco|block/i });
    await expect(toolbar).toBeVisible({ timeout: 10_000 });

    const buttons = toolbar.getByRole("button");
    await expect(buttons).toHaveCount(ELEMENT_ORDER.length);

    // Exactly one chip is the tab stop (roving tabindex); the rest are -1.
    const tabIndices = await buttons.evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).tabIndex),
    );
    expect(tabIndices.filter((t) => t === 0)).toHaveLength(1);
    expect(tabIndices.filter((t) => t === -1)).toHaveLength(
      ELEMENT_ORDER.length - 1,
    );

    // Arrow keys move focus across the toolbar (react-aria behaviour).
    await buttons.first().focus();
    await page.keyboard.press("ArrowRight");
    const focusedAfterRight = await page.evaluate(
      () =>
        document.activeElement
          ?.querySelector("span:last-child")
          ?.textContent?.trim() ?? "",
    );
    expect(focusedAfterRight.length).toBeGreaterThan(0);
  });

  test("N-19 — export/import/Versioni all live in the single TopBar menu", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    // No legacy in-editor action bar / export dropdown / ⋯ menu remains.
    await expect(page.getByTestId("screenplay-actions-bar")).toHaveCount(0);
    await expect(page.getByTestId("screenplay-export-menu")).toHaveCount(0);
    await expect(page.getByTestId("toolbar-menu-trigger")).toHaveCount(0);

    await openScreenplayActions(page);
    await expect(page.getByTestId("screenplay-export-pdf")).toBeVisible();
    await expect(page.getByTestId("menu-item-import-pdf")).toBeVisible();
    await expect(page.getByTestId("menu-item-import-fountain")).toBeVisible();
    // Versioni is no longer a ⋯-menu item — the unified TopBar version chip
    // (`topbar-version-chip`) is the single entry point (Spec 66).
    await expect(page.getByTestId("menu-item-versions")).toHaveCount(0);
    // NOTE: `menu-item-export-fountain` is gated on `hasContent` (the live PM
    // doc), and the clean seed leaves the screenplay's live doc empty (the 9
    // scenes sit in a version, not the active content — N-31 seed gap), so it is
    // intentionally NOT asserted here. Export-Fountain's own behaviour is covered
    // by `screenplay-export.spec.ts` on a content-bearing fixture.
  });

  test("N-19 — the TopBar version chip opens the routed Versions surface", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    // Spec 66: the inline drawer was replaced by the routed master→detail
    // surface, opened from the unified TopBar version chip (single entry point).
    await page.getByTestId("topbar-version-chip").click();
    await expect(page.getByTestId("versions-split-drawer")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("N-32 — a clickable 'Focus' affordance enters focus mode (no keyboard) and exit is localised", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SCREENPLAY_PATH(testProjectId));
    await waitForEditor(page);

    // The enter affordance lives in the Viewbar (touch/iPad have no keyboard).
    const enter = page.getByTestId("screenplay-focus-enter");
    await expect(enter).toBeVisible();
    await enter.click();

    // Focus mode is a full-screen overlay with a LOCALISED exit button (the bug
    // was a hardcoded English "Exit Focus").
    const exit = page.getByRole("button", { name: "Esci da Focus" });
    await expect(exit).toBeVisible();
    await expect(page.getByText("Exit Focus")).toHaveCount(0);

    // Exiting restores the normal chrome (the Viewbar Focus button is usable
    // again — proving the overlay was dismissed, not just hidden behind it).
    await exit.click();
    await expect(exit).toHaveCount(0);
    await expect(enter).toBeVisible();
    await enter.click();
    await expect(
      page.getByRole("button", { name: "Esci da Focus" }),
    ).toBeVisible();
  });

  test("the scene/page counter footer stays visible after scrolling past the first page", async ({
    authenticatedPage: page,
  }) => {
    // Uses the seeded team project (9 scenes / multi-page script) — the
    // regression only shows on a script long enough to scroll. Was an
    // in-flow last child ("stickyFooter" despite never being sticky) that
    // only entered the viewport once the reader scrolled to the very
    // bottom of the document — on a real script, effectively never. Found
    // live 2026-09-03.
    await page.goto(SCREENPLAY_PATH(TEST_TEAM_PROJECT_ID));
    await waitForEditor(page);

    const footer = page.getByTestId("screenplay-counters-footer");
    await expect(footer).toBeVisible();
    const initialBox = await footer.boundingBox();
    expect(initialBox).not.toBeNull();

    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(200);

    await expect(footer).toBeVisible();
    const scrolledBox = await footer.boundingBox();
    expect(scrolledBox).not.toBeNull();
    // Fixed to the viewport: its position relative to the browser window
    // does not move when the page content scrolls underneath it.
    expect(scrolledBox!.y).toBeCloseTo(initialBox!.y, 0);
  });
});
