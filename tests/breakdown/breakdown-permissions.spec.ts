import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToBreakdown,
  switchBreakdownView,
  TEAM_PROJECT_ID,
} from "./helpers";

/**
 * [Spec 10 — E1] Permission tests
 *
 * Pure permission logic (canEdit / canView for owner / editor / viewer /
 * non-member) is fully covered by the vitest suite at
 * `apps/web/app/features/breakdown/lib/permissions.test.ts`.
 *
 * The Playwright slice verifies the wired UI contract under the v3 redesign.
 * v3 removed the BreakdownPanel `add-element-trigger` / `cesare-suggest-scene`
 * write controls; the surviving write affordances are the inline tagging
 * `selection-toolbar` (gated on canEdit) and, in the per-project view, the
 * `bulk-action-bar` (also canEdit-gated). The read-only `breakdown-export-csv`
 * button lives in the per-project view and is available to every role.
 */

test.describe("[Spec 10] Breakdown — permissions", () => {
  test("[254] viewer sees read-only breakdown — no inline tagging, CSV export available", async ({
    authenticatedViewerPage,
  }) => {
    const page = authenticatedViewerPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Write affordance: selecting text must NOT raise the inline tagging
    // toolbar for a read-only viewer (canEdit=false). Double-click a body word.
    await page
      .getByTestId("readonly-screenplay-view")
      .getByText("John", { exact: false })
      .first()
      .dblclick();
    await expect(page.getByTestId("selection-toolbar")).toHaveCount(0);

    // CSV export is read-only — visible to viewers (in the per-project view).
    await switchBreakdownView(page, "per-project");
    await expect(page.getByTestId("breakdown-export-csv")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("[255] owner sees write controls", async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Owner (canEdit=true) gets the inline tagging toolbar on a text selection.
    await page
      .getByTestId("readonly-screenplay-view")
      .getByText("John", { exact: false })
      .first()
      .dblclick();
    await expect(page.getByTestId("selection-toolbar")).toBeVisible({
      timeout: 10_000,
    });

    // CSV export is available in the per-project view for all roles.
    await switchBreakdownView(page, "per-project");
    await expect(page.getByTestId("breakdown-export-csv")).toBeVisible({
      timeout: 10_000,
    });
  });

  test.skip("[256] non-member gets 403", () => {
    // Requires a third seeded user with no membership on the team
    // project. The seed currently only ships owner + viewer for the team
    // project; once a `non-member@ohwriters.dev` fixture user lands, this
    // test should sign in as that user and assert that
    // /projects/<TEAM_PROJECT_ID>/breakdown surfaces the Forbidden state.
  });
});
