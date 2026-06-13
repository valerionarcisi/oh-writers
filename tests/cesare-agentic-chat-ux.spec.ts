import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  openCesareSheet,
  sendCesareMessage,
  resetCesareState,
} from "./helpers/cesare";

/**
 * Cesare chat UX regressions (Narrative Walk N-06 / N-07 / N-09 / N-26).
 *
 *   - N-06 — in the split surface (`?peek=cesare`) the composer must be present
 *     AND inside the viewport, even when the page beside it is a tall document.
 *   - N-07 — Claude-style chat layout: a fixed header and a fixed footer
 *     (composer) with a scrollable body in between, in the split surface.
 *   - N-09 — "Mostra modifiche" on a LOGLINE edit must NOT paint an inline
 *     word-level diff in the editor (ADR-0003 removed the in-editor diff; change
 *     feedback is human, not a code diff). The change stays applied, clean.
 *   - N-26 — the streamed `writing{logline}` step must be ONE clear step per
 *     entity, not one per stream chunk (asserted at the transport level: the
 *     server emits exactly one writing event for the touched entity).
 *
 * Lives in the `mock-ui` Playwright project (MOCK_AI=true) via the
 * `cesare-agentic-*.spec.ts` glob.
 */

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;
const SOGGETTO_PEEK_PATH = `${SOGGETTO_PATH}?peek=cesare`;

interface StreamEvent {
  _tag: string;
  entity?: { domain: string };
  result?: string;
}

function parseNdjson(body: string): StreamEvent[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StreamEvent);
}

test.describe("[cesare-agentic-chat-ux] Cesare chat UX (N-06/07/09/26)", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEST_TEAM_PROJECT_ID);
  });

  test("[N-06/N-07] split surface: composer is visible and inside the viewport; fixed header + footer with a scrollable body", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    // 1440x900 is the viewport that triggered N-06: the tall soggetto stretched
    // the shell grid past the viewport and pushed the composer below the fold.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SOGGETTO_PEEK_PATH);
    await page.waitForLoadState("networkidle");

    const lane = page.getByTestId("cesare-peek-lane");
    await expect(lane).toBeVisible({ timeout: 15_000 });

    const composer = lane.getByPlaceholder("Chiedi a Cesare…");
    await expect(composer).toBeVisible({ timeout: 10_000 });

    // N-06 — the composer must be fully inside the viewport (the bug had it at
    // y≈1075 on a 900px-tall window).
    const geom = await page.evaluate(() => {
      const laneEl = document.querySelector('[data-split-lane="cesare"]');
      const ta = laneEl?.querySelector("textarea");
      const header = laneEl?.querySelector("header");
      const footer = laneEl?.querySelector("footer");
      const body = laneEl?.querySelector('[data-testid="cesare-drawer-body"]');
      const r = (el: Element | null | undefined) =>
        el ? el.getBoundingClientRect() : null;
      const ta_ = r(ta);
      const header_ = r(header);
      const footer_ = r(footer);
      const body_ = r(body);
      return {
        viewportH: window.innerHeight,
        composerTop: ta_ ? ta_.top : null,
        composerBottom: ta_ ? ta_.bottom : null,
        headerTop: header_ ? header_.top : null,
        bodyTop: body_ ? body_.top : null,
        bodyBottom: body_ ? body_.bottom : null,
        footerTop: footer_ ? footer_.top : null,
        footerBottom: footer_ ? footer_.bottom : null,
        bodyOverflowY: body
          ? getComputedStyle(body as Element).overflowY
          : null,
      };
    });

    // N-06 — composer is on-screen.
    expect(geom.composerTop).not.toBeNull();
    expect(geom.composerTop!).toBeGreaterThanOrEqual(0);
    expect(geom.composerBottom!).toBeLessThanOrEqual(geom.viewportH);

    // N-07 — Claude-style: header pinned at the top, footer pinned at the
    // bottom, scrollable body in between.
    expect(geom.headerTop!).toBeLessThan(8);
    expect(geom.bodyTop!).toBeGreaterThanOrEqual(geom.headerTop!);
    expect(geom.footerTop!).toBeGreaterThanOrEqual(geom.bodyBottom! - 1);
    // The footer sits at the bottom of the viewport.
    expect(geom.footerBottom!).toBeLessThanOrEqual(geom.viewportH + 1);
    expect(geom.footerBottom!).toBeGreaterThan(geom.viewportH - 120);
    // The body is the scrolling region.
    expect(geom.bodyOverflowY).toBe("auto");

    // The composer is actually usable in the split surface.
    await composer.focus();
    await composer.fill("Ciao Cesare");
    await expect(composer).toHaveValue("Ciao Cesare");
  });

  // BUG-N61 (fixme ×8, Valerio's go 2026-06-11): asserts the show-changes
  // suppression contract (ADR-0003) that contradicts CLAUDE.md's toggle and was
  // never implemented. Decision + un-fixme with backlog N-38.
  test.fixme("[N-09 / ADR-0003] Mostra modifiche on a logline edit never paints an inline editor diff", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000);
    await page.goto(SOGGETTO_PATH);
    await page.waitForLoadState("networkidle");

    await openCesareSheet(page);
    await sendCesareMessage(
      page,
      "Scrivimi una logline su un detective insonne che insegue un killer.",
    );

    // The agentic edit produced a change-trace card.
    const trace = page.getByTestId("cesare-change-trace").last();
    await expect(trace).toBeVisible({ timeout: 90_000 });

    // Spec 63: on the entity's OWN page the floating card hides "Mostra
    // modifiche" — the in-editor banner owns the highlight (no duplicate).
    await expect(trace.getByTestId("cesare-show-changes-btn")).toHaveCount(0);

    // ADR-0003: no word-level inline-diff overlay is ever painted in the prose,
    // and no split-preview is opened on the entity page.
    await expect(page.getByTestId("cesare-live-diff-inline")).toHaveCount(0);
    await expect(page.locator(".cesare-change-underline")).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-preview-split",
      "open",
    );
  });

  test("[N-26] the stream emits ONE writing step for the touched entity", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    // Transport-level proof for N-26: a single logline write must produce
    // exactly one `writing{logline}` step in the stream — never one per chunk.
    // (The client reducer additionally collapses any consecutive duplicate; see
    // use-cesare-chat-reducer.test.ts.)
    const streamRes = await page.request.post(`${BASE_URL}/api/cesare/stream`, {
      headers: { "Content-Type": "application/json" },
      data: {
        projectId: TEST_TEAM_PROJECT_ID,
        message:
          "Scrivimi una logline su un detective insonne che insegue un killer.",
        pageContext: { page: "soggetto", sceneId: null, sceneNumber: null },
        conversationHistory: [],
      },
    });
    expect(streamRes.status()).toBe(200);
    const events = parseNdjson(await streamRes.text());

    const loglineWrites = events.filter(
      (e) => e._tag === "writing" && e.entity?.domain === "logline",
    );
    expect(
      loglineWrites.length,
      "exactly one writing{logline} step per entity (N-26)",
    ).toBe(1);

    // The tracer invariant still holds — the writing step is present.
    expect(loglineWrites.length).toBeGreaterThanOrEqual(1);
  });

  test("[N-65] the floating composer auto-grows with its content, capped", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(SOGGETTO_PATH);
    await page.waitForLoadState("networkidle");
    await openCesareSheet(page);

    const composer = page.getByLabel("Composer Cesare");
    await expect(composer).toBeVisible({ timeout: 10_000 });

    // One short line: the composer is slim (a single row).
    await composer.fill("una riga");
    const oneLine = await composer.evaluate(
      (el) => (el as HTMLTextAreaElement).offsetHeight,
    );

    // A long multi-line draft: the composer grows…
    await composer.fill(
      Array.from(
        { length: 6 },
        (_, i) =>
          `Riga ${i + 1} di un prompt lungo e articolato che descrive una richiesta complessa a Cesare`,
      ).join("\n"),
    );
    const manyLines = await composer.evaluate(
      (el) => (el as HTMLTextAreaElement).offsetHeight,
    );

    // …grows beyond the single-row height, and never past the 96px cap (then it
    // scrolls internally instead of pushing the chat off-screen) — BUG-N65.
    expect(manyLines).toBeGreaterThan(oneLine);
    expect(manyLines).toBeLessThanOrEqual(96);
  });
});
