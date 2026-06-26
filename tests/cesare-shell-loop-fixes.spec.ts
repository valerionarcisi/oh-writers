// tests/cesare-shell-loop-fixes.spec.ts
//
// Regression locks for the four interconnected Cesare-shell bugs fixed together:
//
//  BUG 1 — nested <button> in the Cesare PEEK row (a button cannot be a
//          descendant of a button → hydration mismatch → unstable re-render).
//  BUG 2 — "Nuova sessione" in the Cesare PEEK/SPLIT header looped the shell
//          ("Maximum update depth exceeded").
//  BUG 3a — switching BETWEEN sessions while Cesare is in split looped the shell.
//  BUG 3b — a session row was persisted EAGERLY on "Nuova sessione" (empty,
//          0-turn "Nuova sessione" rows). It must mint ONLY on the first send.
//  BUG 4b — opening Notifiche then Cesare closed EVERYTHING instead of
//          navigating Cesare into the shared host (Notifiche → ←back-step).
//
// (BUG 4a — Cesare-split → Versioni navigates the shared lane — is already
//  covered by unified-split-navigation.spec.ts.)
//
// Deep-link `?peek=cesare` is the deterministic way to open the Cesare split
// surface (same approach as the other shell specs). MOCK_AI makes the send path
// deterministic.
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { waitForCesareReply } from "./helpers/cesare";
import type { ConsoleMessage, Page } from "@playwright/test";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

// Collect React render-loop + invalid-DOM-nesting console errors for a flow.
const collectShellErrors = (
  page: Page,
): { updateDepth: string[]; descendant: string[] } => {
  const updateDepth: string[] = [];
  const descendant: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Maximum update depth exceeded/i.test(text)) updateDepth.push(text);
    if (/cannot be a descendant of/i.test(text)) descendant.push(text);
  });
  page.on("pageerror", (err) => {
    if (/Maximum update depth exceeded/i.test(err.message))
      updateDepth.push(err.message);
  });
  return { updateDepth, descendant };
};

// The session id list the rail/popover currently shows is not needed; we read
// the persisted session COUNT off the listSessions server fn the app already
// calls, by reading the rendered popover rows instead (no DB access from E2E).
const popoverSessionCount = async (page: Page): Promise<number> =>
  page.getByTestId("cesare-session-row").count();

// The session selector is a TOGGLE: a re-render that races the click can flip it
// shut. Open it robustly — click until the popover is actually visible (bounded).
const openSessionsPopover = async (page: Page): Promise<void> => {
  const selector = page.getByTestId("cesare-session-selector");
  const popover = page.getByTestId("cesare-sessions-popover");
  await expect(selector).toBeVisible({ timeout: 10_000 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await popover.isVisible().catch(() => false)) return;
    await selector.click({ force: true }).catch(() => undefined);
    try {
      await popover.waitFor({ state: "visible", timeout: 2_000 });
      return;
    } catch {
      // Toggled shut by a race — retry.
    }
  }
  await expect(popover).toBeVisible({ timeout: 5_000 });
};

// Close the open sessions popover WITHOUT pressing Escape: the CesarePeekLane has
// its own Escape handler that closes the WHOLE Cesare split lane (clears `?peek`),
// so Escape here would tear the lane down. Toggle the popover shut via the
// selector instead.
const closeSessionsPopover = async (page: Page): Promise<void> => {
  const selector = page.getByTestId("cesare-session-selector");
  const popover = page.getByTestId("cesare-sessions-popover");
  if (await popover.isVisible().catch(() => false)) {
    await selector.click({ force: true }).catch(() => undefined);
    await popover
      .waitFor({ state: "hidden", timeout: 2_000 })
      .catch(() => undefined);
  }
};

// Best-effort popover count that NEVER throws — for polling while the lane may be
// streaming a turn (the selector hides transiently). Returns -1 when the popover
// can't be opened this tick so the outer `expect.poll` simply retries.
const trySessionCount = async (page: Page): Promise<number> => {
  const selector = page.getByTestId("cesare-session-selector");
  const popover = page.getByTestId("cesare-sessions-popover");
  if (!(await selector.isVisible().catch(() => false))) return -1;
  if (!(await popover.isVisible().catch(() => false))) {
    await selector.click({ force: true }).catch(() => undefined);
    await popover
      .waitFor({ state: "visible", timeout: 2_000 })
      .catch(() => undefined);
  }
  if (!(await popover.isVisible().catch(() => false))) return -1;
  const n = await popoverSessionCount(page);
  await closeSessionsPopover(page);
  return n;
};

test.describe("[BUG 1] Cesare peek row has no nested buttons", () => {
  test("the peek expand + close are SIBLING buttons (no descendant error), both clickable", async ({
    authenticatedPage: page,
  }) => {
    const errors = collectShellErrors(page);

    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    // Open the floating drawer, then minimise it to the PEEK row.
    await page
      .getByTestId("bottom-dock")
      .getByTestId("cesare-open-btn")
      .click();
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.cesare))
      .toBe("expanded");
    await page.getByTestId("cesare-minimize-btn").click();

    const expandBtn = page.getByTestId("cesare-peek-expand-btn");
    const closeBtn = page.getByTestId("cesare-peek-close-btn");
    await expect(expandBtn).toBeVisible({ timeout: 5_000 });

    // STRUCTURAL ASSERTION: the close button is NOT a descendant of the expand
    // button (the Bug 1 root). They share a non-button parent container.
    const nested = await page.evaluate(() => {
      const expand = document.querySelector(
        '[data-testid="cesare-peek-expand-btn"]',
      );
      const close = document.querySelector(
        '[data-testid="cesare-peek-close-btn"]',
      );
      return {
        closeInsideExpand: !!(expand && close && expand.contains(close)),
        expandTag: expand?.tagName ?? null,
        closeTag: close?.tagName ?? null,
        siblings: !!(
          expand &&
          close &&
          expand.parentElement === close.parentElement
        ),
      };
    });
    expect(nested.closeInsideExpand).toBe(false);
    expect(nested.expandTag).toBe("BUTTON");
    expect(nested.closeTag).toBe("BUTTON");
    expect(nested.siblings).toBe(true);

    // Expand restores the drawer.
    await expandBtn.click();
    await expect(page.getByTestId("cesare-drawer")).toHaveAttribute(
      "data-state",
      "expanded",
      { timeout: 5_000 },
    );

    expect(errors.descendant, errors.descendant.join("\n")).toHaveLength(0);
    expect(errors.updateDepth, errors.updateDepth.join("\n")).toHaveLength(0);
  });
});

test.describe("[BUG 2] new session from the Cesare split header is console-clean", () => {
  test('"Nuova sessione" in the split popover does not loop and keeps the URL clean', async ({
    authenticatedPage: page,
  }) => {
    const errors = collectShellErrors(page);

    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    await openSessionsPopover(page);
    await page.getByTestId("cesare-session-new-btn").click();

    await page.waitForTimeout(1_500);
    expect(errors.updateDepth, errors.updateDepth.join("\n")).toHaveLength(0);
    expect(new URL(page.url()).pathname).not.toContain("/undefined/");
    // The lane stays Cesare (URL still ?peek=cesare) — new session drops to the
    // empty/pending composer, it does not route away.
    expect(new URL(page.url()).searchParams.get("peek")).toBe("cesare");
  });
});

test.describe("[BUG 3a] switching between sessions in the Cesare split is loop-free", () => {
  test("two consecutive session switches in the split never fire Maximum update depth", async ({
    authenticatedPage: page,
  }) => {
    const errors = collectShellErrors(page);

    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    const pickSessionAt = async (index: number): Promise<void> => {
      await openSessionsPopover(page);
      const rows = page.getByTestId("cesare-session-row");
      await expect(rows.nth(index)).toBeVisible({ timeout: 5_000 });
      await rows.nth(index).click();
    };

    // Ensure ≥2 sessions to switch between. The fixtures project starts with a
    // single Default session; create a SECOND by sending a first message (lazy
    // create), then a fresh one + send again — leaving the rail with ≥2 rows.
    const composer = page.getByLabel("Composer Cesare");
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill("Prima sessione di prova");
    await page.getByTestId("cesare-send-btn").click();
    await waitForCesareReply(page);

    await openSessionsPopover(page);
    await page.getByTestId("cesare-session-new-btn").click();
    await page.waitForTimeout(500);
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill("Seconda sessione di prova");
    await page.getByTestId("cesare-send-btn").click();
    await waitForCesareReply(page);

    // Now SWITCH between the two sessions twice — the loop fired here (Bug 3a).
    await pickSessionAt(0);
    await page.waitForTimeout(600);
    await pickSessionAt(1);
    await page.waitForTimeout(1_000);

    expect(errors.updateDepth, errors.updateDepth.join("\n")).toHaveLength(0);
    expect(new URL(page.url()).pathname).not.toContain("/undefined/");
  });
});

test.describe("[BUG 3b] a session row is minted ONLY on the first send", () => {
  test('"Nuova sessione" adds no row; sending the first message adds exactly one', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${SOGGETTO_PATH}?peek=cesare`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });

    // Baseline row count from the session popover.
    await openSessionsPopover(page);
    const before = await popoverSessionCount(page);
    await closeSessionsPopover(page);

    // "Nuova sessione" — must NOT persist a row. It drops the lane into the
    // fresh/empty pending state (the composer landing) WITHOUT a server write.
    await openSessionsPopover(page);
    await page.getByTestId("cesare-session-new-btn").click();
    // The empty-state landing confirms we're in the pending (no-row) state.
    await expect(page.getByText("Chiedimi qualunque cosa")).toBeVisible({
      timeout: 5_000,
    });
    // The session list count is unchanged — no empty row was minted. Poll a few
    // times to ride out the post-"Nuova" re-render, but it must STAY at `before`.
    await expect
      .poll(async () => await trySessionCount(page), { timeout: 8_000 })
      .toBe(before);

    // Now SEND the first message → exactly one new row appears.
    const composer = page.getByLabel("Composer Cesare");
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill("Una nuova idea di prova per la sessione");
    await page.getByTestId("cesare-send-btn").click();
    // Let the turn render + settle (the selector hides while Cesare streams).
    await waitForCesareReply(page);

    // The first turn mints the row + invalidates the session list. Poll the
    // popover count until it reflects exactly ONE new session (the helper never
    // throws while the lane is still streaming — it returns -1 and we retry).
    await expect
      .poll(async () => await trySessionCount(page), { timeout: 25_000 })
      .toBe(before + 1);
  });
});

test.describe("[BUG 4b] Notifiche → Cesare navigates the shared host (never closes everything)", () => {
  test("opening Cesare while Notifiche is up promotes Cesare INTO the lane; ← returns to Notifiche", async ({
    authenticatedPage: page,
  }) => {
    const errors = collectShellErrors(page);

    await page.goto(SOGGETTO_PATH);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });

    // ── Open Notifiche (the bell) — it owns the shared host ──────────────────
    await page
      .getByTestId("topbar-account")
      .getByTestId("notifications-btn")
      .click();
    await expect(page.getByTestId("notification-center-drawer")).toBeVisible({
      timeout: 5_000,
    });

    // ── Click Cesare in the dock — it must PROMOTE into the host, not close ───
    await page
      .getByTestId("bottom-dock")
      .getByTestId("cesare-open-btn")
      .click();

    // Cesare now owns the lane (?peek=cesare), Notifiche is a ←back-step, and the
    // host stays OPEN — nothing collapsed.
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("peek"))
      .toBe("cesare");
    await expect(page.getByTestId("notification-center-drawer")).toBeHidden({
      timeout: 5_000,
    });
    await expect(page.getByTestId("split-drawer-back")).toBeVisible({
      timeout: 5_000,
    });

    // ── ← returns to Notifiche in the SAME lane ──────────────────────────────
    await page.getByTestId("split-drawer-back").click({ force: true });
    await expect(page.getByTestId("notification-center-drawer")).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("peek"))
      .toBeNull();

    expect(errors.updateDepth, errors.updateDepth.join("\n")).toHaveLength(0);
  });
});
