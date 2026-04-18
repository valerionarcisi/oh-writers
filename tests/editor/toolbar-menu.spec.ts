/**
 * Spec 06 — Toolbar popover menu (E2E)
 *
 * Validates the new ⋯ menu that consolidates screenplay-level actions.
 * Import PDF has been migrated from a top-level toolbar button to a menu item.
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

async function openScreenplay(page: Page, projectId: string) {
  await page.goto(`${BASE_URL}/projects/${projectId}/screenplay`);
  await waitForEditor(page);
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
  await page.getByLabel(/title/i).fill("Toolbar Menu Test");
  await page.getByLabel(/format/i).selectOption("feature");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  projectId = page.url().split("/projects/")[1]?.split("/")[0] ?? "";
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(authCookies);
});

// ─── OHW-100  Trigger visible, top-level Import PDF gone ─────────────────────

test("[OHW-100] toolbar renders a single menu trigger; no top-level Import PDF button", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await expect(page.getByTestId("toolbar-menu-trigger")).toBeVisible();
  // The old top-level Import PDF button must no longer exist in the toolbar
  await expect(page.locator('[data-testid="import-pdf-btn"]')).toHaveCount(0);
});

// ─── OHW-101  Click opens, Esc closes ────────────────────────────────────────

test("[OHW-101] click opens the popover, Esc closes it", async ({ page }) => {
  await openScreenplay(page, projectId);
  await page.getByTestId("toolbar-menu-trigger").click();
  await expect(page.getByTestId("toolbar-menu-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("toolbar-menu-panel")).toHaveCount(0);
});

// ─── OHW-102  Click outside closes ───────────────────────────────────────────

test("[OHW-102] clicking outside the popover closes it", async ({ page }) => {
  await openScreenplay(page, projectId);
  await page.getByTestId("toolbar-menu-trigger").click();
  await expect(page.getByTestId("toolbar-menu-panel")).toBeVisible();
  await page.locator(".ProseMirror").first().click();
  await expect(page.getByTestId("toolbar-menu-panel")).toHaveCount(0);
});

// ─── OHW-103  Focus moves into the panel on open ─────────────────────────────

test("[OHW-103] opening the menu focuses the first enabled item", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await page.getByTestId("toolbar-menu-trigger").click();
  await expect(page.getByTestId("menu-item-import-pdf")).toBeFocused();
});

// ─── OHW-104  Import PDF item triggers file chooser ──────────────────────────

test("[OHW-104] Import PDF menu item opens the system file picker", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await page.getByTestId("toolbar-menu-trigger").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("menu-item-import-pdf").click();
  const chooser = await fileChooserPromise;
  expect(chooser).toBeTruthy();
});

// ─── OHW-105  Versioni toggles inline panel (does not navigate) ──────────────

test("[OHW-105] Versioni menu item toggles the inline panel", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  const urlBefore = page.url();
  await page.getByTestId("toolbar-menu-trigger").click();
  await page.getByTestId("menu-item-versions").click();
  await expect(page.getByTestId("versions-drawer")).toBeVisible();
  expect(page.url()).toBe(urlBefore);
});

// ─── OHW-106  Placeholder items render as disabled ───────────────────────────

test("[OHW-106] Export and Ricalcola render disabled with 'soon' marker", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await page.getByTestId("toolbar-menu-trigger").click();
  for (const id of ["menu-item-export-pdf", "menu-item-renumber"]) {
    const item = page.getByTestId(id);
    await expect(item).toBeDisabled();
    await expect(item).toContainText(/soon/i);
  }
});

// ─── OHW-FP11  Frontespizio is visible to owners ─────────────────────────────

test("[OHW-FP11] Frontespizio menu item is visible and enabled for project owner", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await page.getByTestId("toolbar-menu-trigger").click();
  const item = page.getByTestId("menu-item-title-page");
  await expect(item).toBeVisible();
  await expect(item).toBeEnabled();
});
