// tests/cesare-split-drawer.spec.ts
//
// [OHW-047-A4] Cesare split drawer — page-collapsing side-peek (Spec 46 ?peek=).
//
// The floating Cesare drawer can become a Notion-style SPLIT column that
// COLLAPSES the page: when `?peek=cesare` is set the shell grows a third grid
// column for Cesare and the main lane reflows narrower (NOT a floating overlay
// — the page actually compresses). Closing via × / ESC / browser-back clears
// `?peek` and restores the main lane width.
//
// We also assert the sad path: a cross-project / malformed `?peek` is ignored
// (fail closed) — no lane, no reflow, host page renders alone.
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";

const readMainWidth = async (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const el = document.getElementById("main-content");
    if (!el) return -1;
    return Math.round(el.getBoundingClientRect().width);
  });

test.describe("[OHW-047-A4] Cesare split drawer", () => {
  test("opening the split collapses the main lane; ×/ESC/back restore it", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // Known shell state so the rail column width is deterministic.
    await page.evaluate(() => {
      window.localStorage.setItem("ohw.shell.state", "full");
    });
    await page.reload();
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    const widthBefore = await readMainWidth(page);
    expect(widthBefore).toBeGreaterThan(0);

    // ── Open the split via the floating drawer's "open as column" affordance ──
    await page.getByTestId("bottom-dock").getByLabel("Apri Cesare").click();
    await expect(page.getByTestId("cesare-drawer")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByLabel("Apri come colonna").click();

    // The lane mounts and the page collapses.
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.dataset.cesareSplit ?? ""),
      )
      .toBe("open");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("peek"))
      .toBe("cesare");

    const widthSplit = await readMainWidth(page);
    expect(
      widthSplit,
      `Main lane should COLLAPSE when the split opens (was ${widthBefore}, now ${widthSplit}).`,
    ).toBeLessThan(widthBefore);
    // It must still be visible (a real reflow, not a hidden/overlaid page).
    expect(widthSplit).toBeGreaterThan(0);

    // ── × closes it and restores the main width ──────────────────────────────
    await page.getByTestId("cesare-peek-lane").getByLabel("Chiudi").click();
    await expect(page.getByTestId("cesare-peek-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("peek"))
      .toBeNull();
    await expect.poll(async () => readMainWidth(page)).toBe(widthBefore);

    // ── ESC closes it ────────────────────────────────────────────────────────
    await page.getByTestId("bottom-dock").getByLabel("Apri Cesare").click();
    await page.getByLabel("Apri come colonna").click();
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    expect(await readMainWidth(page)).toBeLessThan(widthBefore);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cesare-peek-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(async () => readMainWidth(page)).toBe(widthBefore);

    // ── Browser-back closes it (the search param pops) ───────────────────────
    await page.getByTestId("bottom-dock").getByLabel("Apri Cesare").click();
    await page.getByLabel("Apri come colonna").click();
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    expect(await readMainWidth(page)).toBeLessThan(widthBefore);

    await page.goBack();
    await expect(page.getByTestId("cesare-peek-lane")).toBeHidden({
      timeout: 5_000,
    });
    await expect.poll(async () => readMainWidth(page)).toBe(widthBefore);
  });

  test("deep-link with ?peek=cesare opens already-split", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown?peek=cesare`,
    );
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("cesare-peek-lane")).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.dataset.cesareSplit ?? ""),
      )
      .toBe("open");
    // The single split chat container is mounted inside the lane.
    await expect(
      page.getByTestId("cesare-peek-lane").getByTestId("cesare-drawer"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("sad path: a cross-project ?peek is ignored (fail closed, no reflow)", async ({
    authenticatedPage: page,
  }) => {
    const foreignPeek = encodeURIComponent(
      "/projects/99999999-9999-4999-8999-999999999999/budget",
    );
    await page.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown?peek=${foreignPeek}`,
    );
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    // No lane, no body flag — the host page renders alone.
    await expect(page.getByTestId("cesare-peek-lane")).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => document.body.dataset.cesareSplit ?? ""),
      )
      .toBe("");
  });
});
