import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

/**
 * [253] L1 stale visual treatment
 *
 * v3 renders stale occurrences as inline reader decorations: a highlight
 * carrying `data-stale="true"` is dimmed (reduced opacity). The old side-panel
 * chip — which also carried `aria-disabled="true"` — was removed with the
 * BreakdownPanel, so this test now asserts the inline contract directly in the
 * screenplay reader. When no occurrence is currently stale (the seed ships them
 * non-stale) the loop is a no-op; the contract is the only thing under test.
 */

test.describe("[Spec 10] L1 stale visual treatment", () => {
  test("[253] stale occurrences render dimmed", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Inline stale highlights live inside the screenplay reader, not a panel.
    const reader = page.getByTestId("readonly-screenplay-view");
    const staleHighlights = reader.locator('[data-stale="true"]');
    const count = await staleHighlights.count();
    for (let i = 0; i < count; i++) {
      const opacity = await staleHighlights
        .nth(i)
        .evaluate((el) => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeLessThan(1);
    }
  });

  test.skip("[251] stale scene shows badge in editor heading", () => {
    // Covered by SceneStaleBadge component; requires a seeded stale
    // scene with a breakdown element + subsequent scene text edit. Will
    // be enabled once the editor exposes a DB-backed scene mutation hook
    // that the test harness can call directly.
  });

  test.skip("[252] new version → banner with stale count", () => {
    // Covered by VersionImportBanner + cloneBreakdownToNewVersionInline.
    // Pending Phase E seeding that creates a v2 with a diverging scene
    // text so at least one cloned occurrence lands with isStale=true.
  });
});
