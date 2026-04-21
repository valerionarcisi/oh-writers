import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

/**
 * [Spec 10 — E1] Permission tests
 *
 * Pure permission logic (canEdit / canView for owner / editor / viewer /
 * non-member) is fully covered by the vitest suite at
 * `apps/web/app/features/breakdown/lib/permissions.test.ts`.
 *
 * The Playwright slice below verifies the wired UI contract: when the
 * server's BreakdownContext returns `canEdit: false`, the panel must hide
 * the write controls (add element + Cesare suggest) regardless of any
 * client-side guess. The server still enforces; this guards against UI
 * regressions that would call disabled mutations.
 */

test.describe("[Spec 10] Breakdown — permissions", () => {
  test("[OHW-254] viewer sees read-only breakdown — no add, no Cesare", async ({
    authenticatedViewerPage,
  }) => {
    await navigateToBreakdown(authenticatedViewerPage, TEAM_PROJECT_ID);
    await expect(
      authenticatedViewerPage.getByTestId("add-element-trigger"),
    ).toHaveCount(0);
    await expect(
      authenticatedViewerPage.getByTestId("cesare-suggest-scene"),
    ).toHaveCount(0);
    await expect(
      authenticatedViewerPage.getByTestId("breakdown-export-trigger"),
    ).toHaveCount(0);
  });

  test("[OHW-255] owner sees write controls", async ({ authenticatedPage }) => {
    await navigateToBreakdown(authenticatedPage, TEAM_PROJECT_ID);
    await expect(
      authenticatedPage.getByTestId("breakdown-export-trigger"),
    ).toBeVisible();
    // Cesare suggest + add element appear once a scene is selected.
    await expect(
      authenticatedPage.getByTestId("cesare-suggest-scene"),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId("add-element-trigger"),
    ).toBeVisible();
  });

  test.skip("[OHW-256] non-member gets 403", () => {
    // Requires a third seeded user with no membership on the team
    // project. The seed currently only ships owner + viewer for the team
    // project; once a `non-member@ohwriters.dev` fixture user lands, this
    // test should sign in as that user and assert that
    // /projects/<TEAM_PROJECT_ID>/breakdown surfaces the Forbidden state.
  });
});
