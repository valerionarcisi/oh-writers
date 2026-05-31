// tests/screenplay-render-loop.spec.ts
//
// ALTO audit finding #1 — "Maximum update depth exceeded" render loop on the
// screenplay editor. This regression spec pins the editor and its ?peek=cesare
// variant to 0 update-depth errors, and guards sessions/new too.
//
// Root cause (a setState-in-useEffect with a per-render dependency): the
// `/screenplay` route passed an INLINE `onOpenVersions` arrow to
// `ScreenplayEditorShell`. The shell feeds that callback into a memoised TopBar
// "actions" slot node; a new arrow every render made the node change identity,
// so `useTopBarSlotPublisher`'s publish effect re-fired → setState → re-render →
// loop. Fixed by stabilising the handler with `useCallback`.
//
// `?peek=cesare` is the SAME bug: the host `/screenplay` route stays mounted and
// keeps publishing that unstable slot node while the peek lane is open, so the
// loop fired there too (the audit's "104-190 errors"). The `useCallback` fix
// resolves both surfaces. `sessions/new` was reported as looping by the audit
// but never did (it renders a different landing); the assertion stands as a guard.
import { test, expect } from "./fixtures";
import type { ConsoleMessage, Page } from "@playwright/test";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";

/** Count "Maximum update depth exceeded" console errors for the test lifetime. */
function trackUpdateDepthErrors(page: Page): { count: () => number } {
  let n = 0;
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && m.text().includes("Maximum update depth")) n++;
  });
  return { count: () => n };
}

test.describe("[OHW-audit-1] render loop is gone on editor / sessions/new / ?peek=cesare", () => {
  test("screenplay editor mounts without an update-depth loop", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(60_000);
    const loop = trackUpdateDepthErrors(authenticatedPage);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    // Let any feedback loop run for a few render cycles before asserting.
    await authenticatedPage.waitForTimeout(3_000);

    expect(loop.count()).toBe(0);
  });

  test("sessions/new landing mounts without an update-depth loop", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(60_000);
    const loop = trackUpdateDepthErrors(authenticatedPage);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/sessions/new`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    await authenticatedPage.waitForTimeout(3_000);

    expect(loop.count()).toBe(0);
  });

  test("?peek=cesare split lane mounts without an update-depth loop", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(60_000);
    const loop = trackUpdateDepthErrors(authenticatedPage);

    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay?peek=cesare`,
    );
    await authenticatedPage.waitForLoadState("networkidle");
    // The split chat opens, loads sessions and re-publishes its send deps — the
    // window where the loop used to spin. Give it a few cycles.
    await authenticatedPage.waitForTimeout(4_000);

    await expect(
      authenticatedPage.getByTestId("cesare-peek-lane"),
    ).toBeVisible();
    expect(loop.count()).toBe(0);
  });
});
