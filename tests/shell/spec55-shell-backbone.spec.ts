// tests/shell/spec55-shell-backbone.spec.ts
//
// [Spec 55 — Shell Action Standard] Narrative-surface backbone.
//
// One spec covering the Narrative Walk shell bugs whose home is the TopBar
// action zone + the per-page context-action registry:
//
//   N-01 — bell lives in the TopBar account zone on every narrative page;
//          clicking it opens the notifications SplitDrawer; no legacy
//          bottom-left / rail-footer notification drawer remains.
//   N-02 — the TopBar version chip (`topbar-version-chip`, Spec 66) is present
//          on every narrative document page; it opens the routed Versions
//          SplitDrawer (`?versions=<docId>`). Versions is NOT a ⋯-menu entry
//          any more — Spec 66 moved it out of the ActionsMenu into the chip.
//   N-03 — each narrative page's export actions (DOCX/SIAE/PDF) are rendered
//          from the shared TopBar action registry — no mid-page export menu,
//          and no "Versioni" entry in the menu (it lives in the version chip).
//   N-04 — the only drawer patterns are Cesare (floating bottom-right) +
//          SplitDrawer; no rail-footer AccountRow.
//   N-05 — Cesare starts CLOSED on first load (no auto-open).
//   N-21 — the redundant "Oh Writers" wordmark is absent under the logo when
//          no project is selected.
//   N-22 — avatar → user settings, gear → project settings (distinct routes).
import { test, expect } from "../fixtures";
import { BASE_URL } from "../fixtures";
import { TEAM_PROJECT_ID } from "../soggetto/helpers";
import type { Page } from "@playwright/test";

const NARRATIVE_SEGMENTS = [
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
] as const;

const gotoNarrative = async (page: Page, segment: string): Promise<void> => {
  await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/${segment}`);
  // Wait for the account zone to mount AND the shell to hydrate. The shell grid
  // (rail beside main) only lays out once `body[data-shell]` is set by the
  // hydration effect; interacting before that races the pre-hydration frame
  // where the TopBar overlaps the rail and clicks are intercepted.
  await expect(page.getByTestId("topbar-account")).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(() => page.evaluate(() => document.body.getAttribute("data-shell")), {
      timeout: 10_000,
    })
    .not.toBeNull();
};

const openActionsMenu = async (page: Page): Promise<void> => {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
};

test.describe("[Spec 55] narrative shell backbone", () => {
  // ── N-01 + N-04 — bell in the TopBar, opens the SplitDrawer, no rail footer ──
  test("N-01/N-04 — bell lives in the TopBar zone and opens the notifications SplitDrawer; no rail AccountRow", async ({
    authenticatedPage: page,
  }) => {
    await gotoNarrative(page, "soggetto");

    const account = page.getByTestId("topbar-account");
    await expect(account).toBeVisible();
    await expect(account.getByTestId("notifications-btn")).toBeVisible();

    // The legacy rail-footer account row is retired (Spec 55).
    await expect(page.getByTestId("rail-account")).toHaveCount(0);

    await account.getByTestId("notifications-btn").click();
    await expect(page.getByTestId("notification-center-drawer")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("N-01 — the bell is present in the TopBar zone on every narrative page", async ({
    authenticatedPage: page,
  }) => {
    for (const segment of NARRATIVE_SEGMENTS) {
      await gotoNarrative(page, segment);
      await expect(
        page.getByTestId("topbar-account").getByTestId("notifications-btn"),
      ).toBeVisible();
      await expect(page.getByTestId("rail-account")).toHaveCount(0);
    }
  });

  // ── N-02 — version chip in the TopBar zone, opens the split (Spec 66) ──
  test("N-02 — the TopBar version chip is on every narrative page and opens the Versions SplitDrawer", async ({
    authenticatedPage: page,
  }) => {
    for (const segment of NARRATIVE_SEGMENTS) {
      await gotoNarrative(page, segment);
      const chip = page.getByTestId("topbar-version-chip");
      await expect(chip).toBeVisible({ timeout: 5_000 });
      await chip.click();
      await expect(page.getByTestId("versions-split-lane")).toBeVisible({
        timeout: 5_000,
      });
      // The surface is driven by the `?versions=` search param (routed split).
      const param = await page.evaluate(
        () => new URL(location.href).searchParams.get("versions") ?? "",
      );
      expect(param.length, `${segment} should set ?versions=`).toBeGreaterThan(
        0,
      );
    }
  });

  // ── N-03 — export actions come from the registry, in the TopBar zone ──
  test("N-03 — soggetto export actions (DOCX + SIAE in IT) are in the TopBar menu, not mid-page", async ({
    authenticatedPage: page,
  }) => {
    await gotoNarrative(page, "soggetto");
    await openActionsMenu(page);

    await expect(
      page.getByRole("menuitem", { name: "Esporta DOCX" }),
    ).toBeVisible({ timeout: 5_000 });
    // SIAE is IT-gated by the registry; the default test user is IT.
    await expect(page.getByTestId("action-export-siae")).toBeVisible();
    // Spec 66: Versions is NOT a ⋯-menu entry — it lives in the TopBar chip.
    await expect(page.getByRole("menuitem", { name: "Versioni" })).toHaveCount(
      0,
    );
    await expect(page.getByTestId("topbar-version-chip")).toBeVisible();
  });

  test("N-03 — synopsis/treatment export PDF is in the TopBar menu; Versioni lives in the version chip", async ({
    authenticatedPage: page,
  }) => {
    for (const segment of ["synopsis", "treatment"] as const) {
      await gotoNarrative(page, segment);
      await openActionsMenu(page);
      await expect(
        page.getByRole("menuitem", { name: "Esporta PDF" }),
      ).toBeVisible({ timeout: 5_000 });
      // Spec 66: Versions is NOT a ⋯-menu entry — it lives in the TopBar chip.
      await expect(
        page.getByRole("menuitem", { name: "Versioni" }),
      ).toHaveCount(0);
      await expect(page.getByTestId("topbar-version-chip")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });

  // ── N-05 — Cesare starts closed on first load ──
  test("N-05 — Cesare starts CLOSED on first load of a narrative page (no auto-open)", async ({
    authenticatedPage: page,
  }) => {
    // Pre-seed a persisted "expanded" state: the bug was that this re-opened
    // Cesare on every load. After the fix it must STILL load closed.
    await page.goto(`${BASE_URL}/dashboard`);
    await page.evaluate(() =>
      window.localStorage.setItem("ohw.cesare.state", "expanded"),
    );

    await gotoNarrative(page, "soggetto");
    await expect
      .poll(async () => page.evaluate(() => document.body.dataset.cesare))
      .toBe("closed");
    // The floating Cesare drawer is not auto-mounted-open; the dock pill shows.
    await expect(page.getByTestId("bottom-dock")).toBeVisible({
      timeout: 5_000,
    });
  });

  // ── N-21 — no redundant "Oh Writers" wordmark when no project ──
  test("N-21 — the redundant 'Oh Writers' wordmark is absent under the logo with no project selected", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const rail = page.getByTestId("left-rail");
    await expect(rail).toBeVisible({ timeout: 15_000 });
    // The brand mark ("O") stands alone — the wordmark text is not rendered.
    await expect(rail.getByText("Oh Writers", { exact: true })).toHaveCount(0);
  });

  // ── N-22 — avatar → user settings, gear → project settings (distinct) ──
  test("N-22 — avatar opens user settings; gear opens project settings (distinct destinations)", async ({
    authenticatedPage: page,
  }) => {
    await gotoNarrative(page, "soggetto");

    // Avatar → user settings (/settings).
    await page.getByTestId("topbar-account").getByTestId("profile-btn").click();
    await page.waitForURL("**/settings", { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe("/settings");

    // Gear → project settings (/projects/:id/settings).
    await gotoNarrative(page, "soggetto");
    await page
      .getByTestId("topbar-account")
      .getByTestId("settings-btn")
      .click();
    await page.waitForURL(`**/projects/${TEAM_PROJECT_ID}/settings`, {
      timeout: 10_000,
    });
    expect(new URL(page.url()).pathname).toBe(
      `/projects/${TEAM_PROJECT_ID}/settings`,
    );
  });
});
