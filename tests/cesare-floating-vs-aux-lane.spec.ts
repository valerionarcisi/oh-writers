// tests/cesare-floating-vs-aux-lane.spec.ts
//
// [BUG · #49 family] The FLOATING Cesare drawer must never fight the routed
// auxiliary split lane for the bottom-right corner, and creating a NEW Cesare
// session must not loop the shell.
//
// Two regressions are locked here:
//
//  (1) Floating drawer vs Versioni lane (REGRESSION 1). The floating Cesare
//      drawer (z `--cesare-drawer-z` = 310) sat OVER the Versioni split lane
//      (z `--split-host-z` = 305) and blanketed the lane's interactive area —
//      pointer-events dead, the composer/version list unclickable. The fix
//      suppresses the floating drawer whenever ANY auxiliary lane owns the
//      single 3rd track (the launcher dock stays reachable and promotes Cesare
//      INTO the shared navigable host instead). We assert the floating drawer
//      is gone while the Versioni lane is open, and the lane's own UI is
//      reachable (a hit-test at the lane's centre lands inside the lane, not on
//      a floating Cesare surface).
//
//  (2) New-session render loop (REGRESSION 2). Creating a new Cesare session
//      while `?peek=cesare` lingered fired a "Maximum update depth exceeded"
//      render storm (the URL ↔ split-history reconciler spun because
//      `isCesarePeek` lit the peek even with an undefined projectId / a central
//      Cesare surface active). The fix fails the peek closed without a project
//      and yields to a central surface. We assert NO "Maximum update depth"
//      console error fires when a new session is created from the drawer popover
//      AND from the `/sessions/new` landing.
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { openCesareSheet } from "./helpers/cesare";
import type { ConsoleMessage, Page } from "@playwright/test";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

// Count how many auxiliary-lane body flags are set at once (N64 invariant: at
// most one auxiliary lane track is ever live).
const activeSplitFlags = async (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const d = document.body.dataset;
    const flags: string[] = [];
    if (d.cesareSplit) flags.push("cesare-split");
    if (d.versionsSplit) flags.push("versions-split");
    if (d.previewSplit) flags.push("preview-split");
    return flags;
  });

// Collect every console error that matches the React render-loop signature.
const collectUpdateDepthErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (
      msg.type() === "error" &&
      /Maximum update depth exceeded/i.test(msg.text())
    ) {
      errors.push(msg.text());
    }
  });
  return errors;
};

test.describe("[BUG · #49] floating Cesare vs auxiliary split lane", () => {
  test("the floating drawer is suppressed while the Versioni lane owns the track, and the lane stays reachable", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    // ── Open the floating Cesare drawer first ────────────────────────────────
    await openCesareSheet(page);
    await expect(page.getByTestId("cesare-drawer")).toBeVisible({
      timeout: 5_000,
    });

    // ── Now open the Versioni split lane via the TopBar version chip ─────────
    const chip = page.getByTestId("topbar-version-chip");
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await chip.click();
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });

    // The Versioni lane owns the single auxiliary track — and ONLY it.
    await expect
      .poll(() =>
        page.evaluate(() => document.body.dataset.versionsSplit ?? ""),
      )
      .toBe("open");
    expect(await activeSplitFlags(page)).toEqual(["versions-split"]);

    // ── The floating Cesare drawer must be GONE (not just behind) ─────────────
    // It is unmounted so it can never blanket the lane's interactive area.
    await expect(page.getByTestId("cesare-drawer")).toBeHidden({
      timeout: 5_000,
    });

    // ── Hit-test: the lane's interactive area is reachable ───────────────────
    // The element at the lane's centre point must live INSIDE the Versioni lane,
    // never inside a floating Cesare surface stacked over it.
    //
    // Probe the centre of the lane's VISIBLE part, not of its element box: the
    // lane wrapper is an in-flow grid column that grows with the page (the
    // drawer inside it is sticky), so on a long document the box centre falls
    // below the viewport, where elementFromPoint answers null — this probe then
    // reported the lane as covered while nothing was covering anything.
    const ownerIsLane = await page.evaluate(() => {
      const lane = document.querySelector(
        '[data-testid="versions-split-lane"]',
      );
      if (!lane) return false;
      const r = lane.getBoundingClientRect();
      const visibleTop = Math.max(r.top, 0);
      const visibleBottom = Math.min(r.bottom, window.innerHeight);
      if (visibleBottom <= visibleTop) return false;
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        (visibleTop + visibleBottom) / 2,
      );
      // The hit element must be the lane or a descendant of it — and must NOT be
      // inside the floating Cesare drawer.
      const insideCesare = hit?.closest('[data-testid="cesare-drawer"]');
      return Boolean(hit && lane.contains(hit) && !insideCesare);
    });
    expect(ownerIsLane).toBe(true);
  });
});

test.describe("[BUG · #49] new Cesare session does not loop the shell", () => {
  test("creating a new session from the drawer popover with ?peek lingering is console-clean", async ({
    authenticatedPage: page,
  }) => {
    const updateDepthErrors = collectUpdateDepthErrors(page);

    // Land on a route that carries `?peek=cesare` — the exact precondition of
    // the loop (the URL the user reported).
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    // The peek opens Cesare as the split lane (valid project → peek is live).
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    // ── Create a NEW session from the drawer session popover ─────────────────
    await page.getByTestId("cesare-session-selector").click();
    await expect(page.getByTestId("cesare-sessions-popover")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("cesare-session-new-btn").click();

    // Give the shell a beat to (mis)behave: a healthy flow settles; the loop
    // would emit dozens of errors here.
    await page.waitForTimeout(1_500);

    expect(
      updateDepthErrors,
      `expected no React render-loop errors, got:\n${updateDepthErrors.join("\n")}`,
    ).toHaveLength(0);

    // The shell never resolves to a `projects/undefined/...` match.
    expect(new URL(page.url()).pathname).not.toContain("/undefined/");
  });

  test("the /sessions/new landing starts a session without a render loop", async ({
    authenticatedPage: page,
  }) => {
    const updateDepthErrors = collectUpdateDepthErrors(page);

    // The deep-linkable new-session landing (the other new-session entry path).
    await page.goto(
      `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/sessions/new`,
    );
    await expect(page.getByTestId("cesare-new-session-landing")).toBeVisible({
      timeout: 15_000,
    });

    // Start the session via the `next-step` suggestion chip. ONLY the next-step
    // chip is wired to `start(prompt)` (create session → route to the
    // conversation); starter chips merely seed the composer. The chip drives the
    // exact new-session flow that reproduced the loop WITHOUT typing into the
    // controlled textarea, so the test is deterministic. (The composer Send path
    // is covered by the drawer-popover test above and the live repro.) The seed's
    // Team Thriller project always has a narrative next step, so the chip renders.
    const nextStepChip = page
      .getByTestId("new-session-suggestion")
      .and(page.locator('[data-variant="next-step"]'))
      .first();
    await expect(nextStepChip).toBeVisible({ timeout: 10_000 });
    await nextStepChip.click();

    // The landing routes to the conversation; wait for the route to settle.
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toContain("/sessions/");

    await page.waitForTimeout(1_000);

    expect(
      updateDepthErrors,
      `expected no React render-loop errors, got:\n${updateDepthErrors.join("\n")}`,
    ).toHaveLength(0);
    expect(new URL(page.url()).pathname).not.toContain("/undefined/");
  });
});

// ── Promote Cesare into the shared host while an aux lane is open ─────────────
// When Versioni / Notifiche already owns the single auxiliary track, the
// floating Cesare drawer is suppressed (it would blanket the lane — #49). The
// launcher must still REACH Cesare: pressing it PROMOTES Cesare INTO the shared
// navigable host as a NEW history entry, so the previous surface survives as a
// ←back-step instead of the whole host collapsing (Bug 4b). This locks that the
// promotion navigates the shared lane (Cesare shows, the previous surface is one
// ← away) and never loops.
test.describe("[N78-A6] promote Cesare into the shared host", () => {
  const versionsParam = (page: Page): string | null =>
    new URL(page.url()).searchParams.get("versions");
  const peekParam = (page: Page): string | null =>
    new URL(page.url()).searchParams.get("peek");

  test("launcher promotes Cesare into the host while Versioni owns the lane; ← returns to Versioni", async ({
    authenticatedPage: page,
  }) => {
    const updateDepthErrors = collectUpdateDepthErrors(page);

    // Open Versioni as the lane owner (via the chip from a fresh page).
    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("topbar-version-chip").click();
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect.poll(() => versionsParam(page)).not.toBeNull();
    expect(await activeSplitFlags(page)).toEqual(["versions-split"]);

    // The floating drawer is suppressed, but the launcher dock stays reachable.
    await expect(page.getByTestId("cesare-drawer")).toBeHidden({
      timeout: 5_000,
    });
    const launcher = page
      .getByTestId("bottom-dock")
      .getByTestId("cesare-open-btn");
    await expect(launcher).toBeVisible({ timeout: 5_000 });

    // ── Press the launcher — Cesare PROMOTES into the shared host ─────────────
    await launcher.click();
    // Cesare now owns the track (peek lane visible, `?peek=cesare`); Versioni
    // ceded the URL but stays in the shared history as a ←back-step.
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("versions-split-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(() => peekParam(page)).toBe("cesare");
    await expect.poll(() => versionsParam(page)).toBeNull();
    expect(await activeSplitFlags(page)).toEqual(["cesare-split"]);

    // ── ← returns to Versioni: the previous surface was NOT stranded ──────────
    await expect(page.getByTestId("split-drawer-back")).toBeVisible({
      timeout: 5_000,
    });
    await page
      .getByTestId("split-drawer-back")
      .click({ force: true })
      .catch(() => undefined);
    await expect(page.getByTestId("versions-split-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect.poll(() => versionsParam(page)).not.toBeNull();
    await expect.poll(() => peekParam(page)).toBeNull();

    expect(
      updateDepthErrors,
      `expected no React render-loop errors, got:\n${updateDepthErrors.join("\n")}`,
    ).toHaveLength(0);
  });
});

// ── Lazy session: opening Cesare must NOT persist a NEW session ───────────────
// Spec 51 made Cesare persistent, but a session row is created LAZILY — only at
// the FIRST sent message, never merely by opening the drawer / column (an earlier
// shell loop spawned phantom sessions on open). The seed already ships one
// session, so the contract is a DELTA: the persisted session count must be
// UNCHANGED after opening Cesare floating AND as a column without sending. The
// count is read from the rail rows, each a real `cesare_sessions` row surfaced by
// the DB-backed `listSessions`.
test.describe("[Spec 51] lazy Cesare session creation", () => {
  const sessionRowCount = async (page: Page): Promise<number> =>
    page.getByLabel(/^Sessione Cesare:/).count();

  test("opening Cesare (floating + column) without sending creates no new session", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    // Baseline count (seed ships at least one session).
    const baseline = await sessionRowCount(page);

    // ── Open the floating drawer — no send ───────────────────────────────────
    await openCesareSheet(page);
    await expect(page.getByTestId("cesare-drawer")).toBeVisible({
      timeout: 5_000,
    });
    await page.waitForTimeout(800);
    expect(await sessionRowCount(page)).toBe(baseline);

    // ── Promote to the split column — still no send ──────────────────────────
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 8_000,
    });
    // The rail's session list re-fetches after this navigation — under CI
    // load a fixed 800ms sleep could read it mid-refetch (briefly empty, a
    // spurious 0 rather than a real regression). Poll instead of sleeping.
    // Unchanged — the column is just a surface; no message has been sent.
    await expect
      .poll(() => sessionRowCount(page), { timeout: 5_000 })
      .toBe(baseline);
  });
});
