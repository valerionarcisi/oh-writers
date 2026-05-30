// tests/cesare-header-minimal.spec.ts
//
// [OHW-047-A3] Cesare header command trim (Notion-minimal).
//
// The Cesare drawer header must show ONLY the allowed primary icons —
// `↗ Espandi`, `… Altre azioni`, `− Minimizza`, `× Chiudi`. Every secondary
// action (bell / avatar / gear carried from the dock, new chat, share/export,
// step-back) lives inside the `…` overflow popover (react-aria menu) and must
// NOT sit inline in the header. Spec 47 task A3 + Spec 44 drawer-header model.
import { test, expect } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { BASE_URL } from "./fixtures";

test.describe("[OHW-047-A3] Cesare header is Notion-minimal", () => {
  test("header shows only the allowed primary icons and the overflow opens", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
    await expect(page.getByTestId("breakdown-page-v2")).toBeVisible({
      timeout: 15_000,
    });

    // Open Cesare via the BottomDock.
    const dock = page.getByTestId("bottom-dock");
    await expect(dock).toBeVisible({ timeout: 5_000 });
    await dock.getByLabel("Apri Cesare").click();

    const drawer = page.getByTestId("cesare-drawer");
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // ── Allowed primary icons are visible ─────────────────────────────────
    await expect(drawer.getByRole("button", { name: "Espandi" })).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Altre azioni" }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Minimizza" }),
    ).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Chiudi" })).toBeVisible();

    // ── Secondary actions are NOT inline in the header ────────────────────
    // Bell / avatar / gear and step-back moved into the `…` overflow.
    await expect(
      drawer.getByRole("button", { name: "Notifiche", exact: true }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Profilo", exact: true }),
    ).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Impostazioni", exact: true }),
    ).toHaveCount(0);

    // ── The `…` overflow opens and surfaces the secondary actions ─────────
    await drawer.getByRole("button", { name: "Altre azioni" }).click();
    const menu = page.getByTestId("cesare-overflow-menu");
    await expect(menu).toBeVisible({ timeout: 3_000 });
    await expect(
      menu.getByRole("menuitem", { name: "Nuova conversazione" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /Notifiche/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Impostazioni" }),
    ).toBeVisible();

    // Clicking outside closes the overflow without dismissing the drawer.
    await page.getByTestId("breakdown-page-v2").click({
      position: { x: 5, y: 5 },
    });
    await expect(menu).toBeHidden();
    await expect(drawer).toBeVisible();
  });
});
