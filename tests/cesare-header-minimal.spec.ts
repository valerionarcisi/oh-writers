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
    await expect(
      account.getByRole("button", { name: "Notifiche" }),
    ).toBeVisible();
    await expect(
      account.getByRole("button", { name: "Profilo" }),
    ).toBeVisible();
    await expect(
      account.getByRole("button", { name: "Impostazioni" }),
    ).toBeVisible();

    // ── The BottomDock no longer renders bell/settings — only the Cesare pill ─
    const dock = page.getByTestId("bottom-dock");
    await expect(dock).toBeVisible({ timeout: 5_000 });
    await expect(
      dock.getByRole("button", { name: "Apri Cesare" }),
    ).toBeVisible();
    await expect(dock.getByRole("button", { name: /Notifiche/ })).toHaveCount(
      0,
    );
    await expect(
      dock.getByRole("button", { name: /Impostazioni/ }),
    ).toHaveCount(0);

    // ── Open Cesare and assert the minimal header ────────────────────────────
    await dock.getByRole("button", { name: "Apri Cesare" }).click();
    const drawer = page.getByTestId("cesare-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    await expect(drawer.getByRole("button", { name: "Espandi" })).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Minimizza" }),
    ).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Chiudi" })).toBeVisible();

    // No `…` overflow trigger and no account icons inside the header.
    await expect(
      drawer.getByRole("button", { name: "Altre azioni" }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Notifiche", exact: true }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Profilo", exact: true }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Impostazioni", exact: true }),
    ).toHaveCount(0);
  });
});
