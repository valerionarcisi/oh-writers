// tests/cesare-header-minimal.spec.ts
//
// [047-A3 / Spec 55] Cesare header command trim (Notion-minimal) + account
// zone home.
//
// Spec 55 supersedes Spec 47b FIX 1: the Cesare drawer header is truly minimal —
// agent name + session selector + `↗ Apri dettaglio sessione`, `− Minimizza`,
// `× Chiudi`. There
// is NO `…` overflow. Bell / avatar / gear are NOT in the header and NOT in the
// BottomDock; they now live in the TOPBAR account zone (the single home).
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";

test.describe("[047-A3] Cesare header is Notion-minimal; account zone in TopBar", () => {
  test("header has no overflow; bell/avatar/gear live in the TopBar zone, not the dock or header", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });
    // Gate interactions on shell hydration (body[data-shell]) — pre-hydration
    // the TopBar overlaps the rail and clicks are intercepted.
    await expect
      .poll(
        () => page.evaluate(() => document.body.getAttribute("data-shell")),
        { timeout: 10_000 },
      )
      .not.toBeNull();

    // ── The TopBar account zone is the single home for bell/avatar/gear ──
    const account = page.getByTestId("topbar-account");
    await expect(account).toBeVisible({ timeout: 10_000 });
    await expect(account.getByTestId("notifications-btn")).toBeVisible();
    await expect(account.getByTestId("profile-btn")).toBeVisible();
    await expect(account.getByTestId("settings-btn")).toBeVisible();

    // ── The legacy rail-footer account row is gone (Spec 55) ──
    await expect(page.getByTestId("rail-account")).toHaveCount(0);

    // ── The BottomDock no longer renders bell/settings — only the Cesare pill ─
    const dock = page.getByTestId("bottom-dock");
    await expect(dock).toBeVisible({ timeout: 5_000 });
    await expect(dock.getByTestId("cesare-open-btn")).toBeVisible();
    await expect(dock.getByTestId("notifications-btn")).toHaveCount(0);
    await expect(dock.getByTestId("settings-btn")).toHaveCount(0);

    // ── Open Cesare and assert the minimal header ────────────────────────────
    await dock.getByTestId("cesare-open-btn").click();
    const drawer = page.getByTestId("cesare-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await expect(drawer.getByTestId("cesare-expand-btn")).toBeVisible();
    await expect(drawer.getByTestId("cesare-minimize-btn")).toBeVisible();
    await expect(drawer.getByTestId("cesare-close-btn")).toBeVisible();

    // No `…` overflow trigger and no account icons inside the header.
    await expect(
      drawer.getByRole("button", { name: "Altre azioni" }),
    ).toHaveCount(0);
    await expect(drawer.getByTestId("notifications-btn")).toHaveCount(0);
    await expect(drawer.getByTestId("profile-btn")).toHaveCount(0);
    await expect(drawer.getByTestId("settings-btn")).toHaveCount(0);
  });
});
