/**
 * Spec 09 / 55 — Save indicator (E2E)
 *
 * The screenplay now reports its save state through the shell-level
 * `SaveStatusIndicator` (`data-testid="save-status-indicator"` +
 * `data-state` of saved|saving|offline), not the retired in-toolbar
 * `save-indicator` pill (which had a clickable data-status of saved|dirty).
 * The pill self-hides until the first edit, and there is no clickable
 * flush on the pill — Cmd/Ctrl+S still force-saves from the editor.
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
  // The create-project form is localised (IT default): Titolo / Formato / Crea.
  await page
    .getByRole("textbox", { name: /titolo|title/i })
    .fill("Save Indicator Test");
  await page
    .getByRole("combobox", { name: /formato|format/i })
    .selectOption("feature");
  await page
    .getByRole("button", { name: /crea progetto|create project/i })
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  projectId = page.url().split("/projects/")[1]?.split("/")[0] ?? "";
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(authCookies);
});

const indicator = (page: Page) => page.getByTestId("save-status-indicator");
const savedPill = (page: Page) =>
  page.locator('[data-testid="save-status-indicator"][data-state="saved"]');

const forceSave = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __ohWritersForceSave?: () => void }
    ).__ohWritersForceSave?.(),
  );

// ─── 140  Pill self-hides on a fresh, untouched editor ───────────────────

test("[140] the indicator is hidden on a fresh, untouched editor", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  // It must not flash a stale "saved" on a doc the user hasn't edited.
  await expect(indicator(page)).toHaveCount(0);
});

// ─── 141  Typing surfaces the indicator (saving) ─────────────────────────

test("[141] typing surfaces the save indicator", async ({ page }) => {
  await openScreenplay(page, projectId);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("FADE IN:");
  // The first edit reveals the pill; it is either mid-save ("saving") or has
  // already settled ("saved") depending on debounce timing.
  await expect(indicator(page)).toBeVisible({ timeout: 5_000 });
  await expect(indicator(page)).toHaveAttribute("data-state", /saving|saved/);
});

// ─── 142  A forced save settles the indicator on 'saved' ─────────────────

test("[142] the indicator settles on 'saved' after a save", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("EXT. STREET - NIGHT");
  await forceSave(page);
  await expect(savedPill(page)).toBeVisible({ timeout: 10_000 });
});

// [144] removed: the shell save-status pill is not clickable (the retired
// in-toolbar pill exposed a "save now" click). Forced save is covered below.

// ─── 143  Cmd/Ctrl+S forces a save ───────────────────────────────────────

test("[143] Cmd/Ctrl+S forces a save", async ({ page }) => {
  await openScreenplay(page, projectId);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("Another edit");

  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("saveScreenplay") && r.request().method() === "POST",
      { timeout: 10_000 },
    ),
    page.keyboard.press("ControlOrMeta+s"),
  ]);
  expect(resp.ok()).toBe(true);

  // After the forced save settles, the pill is no longer mid-save: it either
  // reads "saved" or self-hides (the screenplay publishes no "saved" state once
  // the change is flushed via the manual-save path).
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .querySelector('[data-testid="save-status-indicator"]')
              ?.getAttribute("data-state") ?? "absent",
        ),
      { timeout: 10_000 },
    )
    .not.toBe("saving");
});
