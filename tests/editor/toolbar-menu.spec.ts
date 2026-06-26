/**
 * Spec 06 + Spec 55a — Screenplay actions menu (E2E)
 *
 * Spec 55a moved the screenplay-level actions out of the in-editor ⋯ ToolbarMenu
 * into the single TopBar "Altre azioni" menu (the one home for page actions).
 * The popover mechanics (open/close/focus) are now owned + tested by the shared
 * `DropdownMenu`/`ActionsMenu` primitives; here we validate that every action
 * (import PDF/Fountain, renumber, title page) is reachable from that menu.
 */

import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, waitForEditor } from "../helpers";

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";

async function signInViaApi(email: string, password: string) {
  const resp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(`Sign-in failed: ${resp.status}`);
  return resp.headers
    .getSetCookie()
    .map((header) => {
      const [nameValue] = header.split(";");
      if (!nameValue) return null;
      const eqIdx = nameValue.indexOf("=");
      if (eqIdx === -1) return null;
      return {
        name: nameValue.slice(0, eqIdx).trim(),
        value: nameValue.slice(eqIdx + 1).trim(),
        domain: "localhost",
        path: "/",
      };
    })
    .filter(Boolean) as {
    name: string;
    value: string;
    domain: string;
    path: string;
  }[];
}

async function openScreenplay(page: Page, id: string) {
  await page.goto(`${BASE_URL}/projects/${id}/screenplay`);
  await waitForEditor(page);
}

async function openActionsMenu(page: Page) {
  const trigger = page.getByLabel("Altre azioni");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await expect(page.getByTestId("screenplay-actions-menu")).toBeVisible({
    timeout: 5_000,
  });
}

let projectId = "";
let authCookies: {
  name: string;
  value: string;
  domain: string;
  path: string;
}[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(90_000);
  authCookies = await signInViaApi(TEST_EMAIL, TEST_PASSWORD);
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await page.goto(`${BASE_URL}/projects/new`);
  await page.waitForURL(/\/projects\/new/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/titolo|title/i).fill("Toolbar Menu Test");
  await page.getByLabel(/formato|format/i).selectOption("feature");
  await page
    .getByRole("button", { name: /crea progetto|create project|create/i })
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  projectId = page.url().split("/projects/")[1]?.split("/")[0] ?? "";
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(authCookies);
});

// ─── 100  Single TopBar actions menu; no in-editor ⋯ menu ────────────────

test("[100] the TopBar actions menu is the single home; no in-editor toolbar menu", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await expect(page.getByLabel("Altre azioni")).toBeVisible();
  await expect(page.getByTestId("toolbar-menu-trigger")).toHaveCount(0);
  await expect(page.locator('[data-testid="import-pdf-btn"]')).toHaveCount(0);
});

// ─── 104  Import PDF item triggers file chooser ──────────────────────────

test("[104] Import PDF menu item opens the system file picker", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await openActionsMenu(page);
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("menu-item-import-pdf").click();
  const chooser = await fileChooserPromise;
  expect(chooser).toBeTruthy();
});

// ─── 105  Importa Fountain item opens the system file picker ─────────────

test("[105] Importa Fountain menu item opens the system file picker", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await openActionsMenu(page);
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("menu-item-import-fountain").click();
  const chooser = await fileChooserPromise;
  expect(chooser).toBeTruthy();
});

// ─── 106  Resequence is reachable and enabled ────────────────────────────

test("[106] Ricalcola numerazione is rendered and enabled", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await openActionsMenu(page);
  const item = page.getByTestId("menu-item-renumber");
  await expect(item).toBeVisible();
  await expect(item).toBeEnabled();
});

// ─── FP11  Frontespizio is visible to owners ─────────────────────────────

test("[FP11] Frontespizio menu item is visible and enabled for project owner", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await openActionsMenu(page);
  const item = page.getByTestId("menu-item-title-page");
  await expect(item).toBeVisible();
  await expect(item).toBeEnabled();
});
