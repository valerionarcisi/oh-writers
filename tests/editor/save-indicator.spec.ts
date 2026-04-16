/**
 * Spec 09 — Save indicator + manual save (E2E)
 *
 * The toolbar shows a single pill that reflects the save state and can be
 * clicked (or Cmd/Ctrl+S) to force an immediate save.
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
  authCookies = await signInViaApi(TEST_EMAIL, TEST_PASSWORD);
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await page.goto(`${BASE_URL}/projects/new`);
  await page.waitForURL(/\/projects\/new/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/title/i).fill("Save Indicator Test");
  await page.getByLabel(/format/i).selectOption("feature");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  projectId = page.url().split("/projects/")[1]?.split("/")[0] ?? "";
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(authCookies);
});

// ─── OHW-140  Default state is saved/green ───────────────────────────────────

test("[OHW-140] fresh editor shows indicator in 'saved' state", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await expect(page.getByTestId("save-indicator")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

// ─── OHW-141  Typing turns it amber/dirty ────────────────────────────────────

test("[OHW-141] typing marks the indicator dirty", async ({ page }) => {
  await openScreenplay(page, projectId);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("FADE IN:");
  await expect(page.getByTestId("save-indicator")).toHaveAttribute(
    "data-status",
    "dirty",
  );
});

// ─── OHW-142  Autosave debounce resolves to saved ────────────────────────────

test("[OHW-142] after debounce the indicator returns to saved", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("EXT. STREET - NIGHT");
  await expect(page.getByTestId("save-indicator")).toHaveAttribute(
    "data-status",
    "saved",
    { timeout: 10_000 },
  );
});

// ─── OHW-144  Click on dirty indicator flushes the save ──────────────────────

test("[OHW-144] clicking a dirty indicator flushes the save immediately", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("More text");
  const indicator = page.getByTestId("save-indicator");
  await expect(indicator).toHaveAttribute("data-status", "dirty");
  await indicator.click();
  await expect(indicator).toHaveAttribute("data-status", "saved", {
    timeout: 5_000,
  });
});

// ─── OHW-143  Cmd/Ctrl+S triggers a save ─────────────────────────────────────

test("[OHW-143] Cmd/Ctrl+S forces a save while dirty", async ({ page }) => {
  await openScreenplay(page, projectId);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("Another edit");
  await expect(page.getByTestId("save-indicator")).toHaveAttribute(
    "data-status",
    "dirty",
  );
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByTestId("save-indicator")).toHaveAttribute(
    "data-status",
    "saved",
    { timeout: 5_000 },
  );
});
