// tests/cesare-header-minimal.spec.ts
//
// [OHW-047-A3] Cesare header command trim (Notion-minimal) + account row home.
//
// Spec 47b FIX 1: the Cesare drawer header is truly minimal — agent name +
// session selector + `↗ Espandi`, `− Minimizza`, `× Chiudi`. There is NO `…`
// overflow. Bell / avatar / gear are NOT in the header and NOT in the
// BottomDock; they live ONLY in the LeftRail FOOTER account row.
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";

test.describe("[OHW-047-A3] Cesare header is Notion-minimal; account row in rail footer", () => {
  test("header has no overflow; bell/avatar/gear live in the rail footer, not the dock or header", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // ── The rail footer account row is the single home for bell/avatar/gear ──
    const account = page.getByTestId("rail-account");
    await expect(account).toBeVisible({ timeout: 10_000 });
    await expect(account.getByTestId("notifications-btn")).toBeVisible();
    await expect(account.getByTestId("profile-btn")).toBeVisible();
    await expect(account.getByTestId("settings-btn")).toBeVisible();

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
