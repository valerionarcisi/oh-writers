import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { BASE_URL } from "../helpers";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

test.describe("[Spec 10h] Breakdown read-only UX", () => {
  test("[10h-1] scene heading in breakdown has no menu trigger", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);
    await expect(page.getByTestId("readonly-screenplay-view")).toBeVisible();

    // ReadOnlyScreenplayView passes { readOnly: true } to createHeadingNodeView,
    // which skips appending the ⋮ button entirely. The element must be absent.
    await expect(page.getByTestId("scene-menu-trigger")).toHaveCount(0);
  });

  // SKIPPED (removed UI, not a testid rename): same root cause as inline-tagging
  // 287. v3 removed the SceneTOC sidebar (`breakdown-toc`) and its dedicated
  // scroll container (`breakdown-script`) — the window now scrolls and there is
  // no visible active-TOC-item to assert. The active-scene-on-scroll logic still
  // runs inside ScriptReader (driving the RecapStrip) but has no TOC surface.
  test.skip("[10h-2] reader scroll updates active TOC item", () => {});

  test("[10h-3] regression: heading in screenplay editor shows menu trigger", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`);

    // Wait for the editable PM editor to mount.
    await expect(page.locator(".ProseMirror").first()).toBeVisible({
      timeout: 15_000,
    });

    // In the editable editor readOnly is false, so the ⋮ button is always
    // appended. Click it (force because it is positioned outside the content flow)
    // and confirm the scene menu appears.
    const trigger = page.getByTestId("scene-menu-trigger").first();
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click({ force: true });

    await expect(page.getByTestId("scene-menu")).toBeVisible();
  });
});
