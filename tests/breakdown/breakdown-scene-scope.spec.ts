import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

// BUG-N68 Part A — the "Per scena" reader defaults to the SINGLE active scene
// so the scene-scoped header (SC. N · costs · element counts) and the body
// below it agree. A "Copione intero" toggle reverts to the continuous
// whole-script run. Before the fix the reader always rendered the entire
// screenplay while the header claimed a single scene ("spaginato").
test.describe("[BUG-N68] breakdown Per scena — scene-scope toggle", () => {
  test("[OHW-N68a] defaults to a single scene; the toggle reveals the full script", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    const reader = page.getByTestId("breakdown-screenplay");
    const headings = reader.locator(".pm-heading");

    // The scope toggle exists and defaults to "Scena singola".
    const single = page.getByTestId("segmented-single");
    const full = page.getByTestId("segmented-full");
    await expect(single).toBeChecked();
    await expect(full).not.toBeChecked();

    // Default (single): exactly ONE scene heading is rendered — the body is
    // scoped to the active scene, matching the header.
    await expect(headings).toHaveCount(1);

    // Switch to "Copione intero": the whole screenplay renders (> 1 heading).
    // The TEAM seed screenplay has at least 2 scenes.
    await expect(async () => {
      await full.click();
      await expect(full).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    const fullCount = await headings.count();
    expect(fullCount).toBeGreaterThan(1);

    // Switching back to "Scena singola" re-scopes the body to one scene.
    await expect(async () => {
      await single.click();
      await expect(single).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expect(headings).toHaveCount(1);
  });

  test("[OHW-N68b] single scope exposes the Indice scene switcher; picking a scene re-slices the reader", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // In single scope the Indice (scene switcher) must be available — otherwise
    // the user is stranded on the first scene with no way to navigate.
    const indice = page.getByTestId("breakdown-indice-trigger");
    await expect(indice).toBeVisible();

    const reader = page.getByTestId("breakdown-screenplay");
    const firstHeading = await reader
      .locator(".pm-heading")
      .first()
      .innerText();

    // Open the Indice and pick the second scene (the first listed row is the
    // current scene; nth(1) is the next one).
    await indice.click();
    const sceneButtons = page.getByRole("button").filter({ hasText: /^SC\./ });
    const secondScene = sceneButtons.nth(1);
    await expect(secondScene).toBeVisible();
    await secondScene.click();

    // The reader still shows exactly one scene, but it is a DIFFERENT one.
    await expect(reader.locator(".pm-heading")).toHaveCount(1);
    const newHeading = await reader.locator(".pm-heading").first().innerText();
    expect(newHeading).not.toBe(firstHeading);
  });

  test("[OHW-N68c] element underlines render via text-decoration, not a box border", async ({
    authenticatedPage: page,
  }) => {
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // The screenplay is set at line-height 1.0 (tight pagination). A bottom
    // border on the highlight overflowed the line and collided with the row
    // below — the underline looked misaligned. The fix anchors the underline to
    // the glyph baseline via text-decoration, with no box border.
    const el = page
      .getByTestId("breakdown-screenplay")
      .locator("[data-element-id]")
      .first();
    await expect(el).toBeVisible();

    const style = await el.evaluate((node) => {
      const cs = getComputedStyle(node);
      return {
        decorationLine: cs.textDecorationLine,
        decorationColor: cs.textDecorationColor,
      };
    });
    // The element name is underlined via text-decoration (baseline-anchored)…
    expect(style.decorationLine).toContain("underline");
    // …in the category colour, not the default text colour — i.e. it is the
    // breakdown highlight underline, not an incidental link/heading underline.
    expect(style.decorationColor).not.toBe("rgb(0, 0, 0)");
  });
});
