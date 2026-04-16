/**
 * Spec 10 — Version viewing marker (E2E)
 *
 * Validates the ephemeral "view mode" that lets the writer inspect a frozen
 * snapshot from inside the editor. The banner + read-only editor make it
 * unmistakable that the content on screen is a version, not the live draft.
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

async function openScreenplay(page: Page, pid: string) {
  await page.goto(`${BASE_URL}/projects/${pid}/screenplay`);
  await waitForEditor(page);
}

async function openVersionsPanel(page: Page) {
  await page.getByTestId("toolbar-menu-trigger").click();
  await page.getByTestId("menu-item-versions").click();
  await expect(page.getByTestId("versions-drawer")).toBeVisible();
}

async function typeIntoEditor(page: Page, text: string) {
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type(text);
}

async function forceSave(page: Page) {
  await page.evaluate(() => {
    const force = (window as unknown as Record<string, unknown>)[
      "__ohWritersForceSave"
    ] as (() => void) | undefined;
    force?.();
  });
  await page.waitForTimeout(500);
}

async function addManualVersion(page: Page, label: string) {
  await page.getByTestId("versions-new-trigger").click();
  await page.getByTestId("versions-new-label-input").fill(label);
  await page.getByTestId("versions-new-save").click();
  const drawer = page.getByTestId("versions-drawer");
  await expect(
    drawer.locator(`[data-testid^="version-row-"]`, { hasText: label }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Click a version row by its exact label text to enter view mode.
 * Uses the drawer as scope to avoid false matches with the toolbar label.
 */
async function clickVersionRow(page: Page, label: string) {
  const drawer = page.getByTestId("versions-drawer");
  await drawer
    .locator(`[data-testid^="version-row-"]`, { hasText: label })
    .click();
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
  await page.getByLabel(/title/i).fill("Version Viewing Test");
  await page.getByLabel(/format/i).selectOption("feature");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  projectId = page.url().split("/projects/")[1]?.split("/")[0] ?? "";
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(authCookies);
});

// ─── OHW-150  Two drafts land in the versions panel ──────────────────────────

test("[OHW-150] fresh authoring: two drafts show up in the panel", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await typeIntoEditor(page, "INT. OFFICE - DAY\n\nDraft one content.");
  await forceSave(page);

  await openVersionsPanel(page);
  await addManualVersion(page, "Draft 1");

  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n\nDraft two addition.");
  await forceSave(page);
  await addManualVersion(page, "Draft 2");

  const drawer = page.getByTestId("versions-drawer");
  await expect(
    drawer.locator('[data-testid^="version-row-"]', { hasText: "Draft 1" }),
  ).toBeVisible();
  await expect(
    drawer.locator('[data-testid^="version-row-"]', { hasText: "Draft 2" }),
  ).toBeVisible();
});

// ─── OHW-151  Clicking a version row activates banner + read-only editor ──────

test("[OHW-151] clicking a version row enters view mode: banner visible, editor read-only", async ({
  page,
}) => {
  // Self-contained: create the version in this test
  await openScreenplay(page, projectId);
  await typeIntoEditor(page, "INT. OFFICE - DAY");
  await forceSave(page);
  await openVersionsPanel(page);
  const label = `V151-${Date.now()}`;
  await addManualVersion(page, label);

  await clickVersionRow(page, label);

  await expect(page.getByTestId("version-viewing-banner")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("version-viewing-banner")).toContainText(label);

  // Editor is non-editable — typing must not alter the content.
  const before = await page.evaluate(() => {
    const get = (window as unknown as Record<string, unknown>)[
      "__ohWritersFountain"
    ] as (() => string) | undefined;
    return get?.() ?? "";
  });
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("SHOULD NOT APPEAR");
  const after = await page.evaluate(() => {
    const get = (window as unknown as Record<string, unknown>)[
      "__ohWritersFountain"
    ] as (() => string) | undefined;
    return get?.() ?? "";
  });
  expect(after).toBe(before);
});

// ─── OHW-152  Torna alla bozza restores the live draft ───────────────────────

test("[OHW-152] Torna alla bozza exits view mode, live draft is editable", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await typeIntoEditor(page, "INT. OFFICE - DAY");
  await forceSave(page);
  await openVersionsPanel(page);
  const label = `V152-${Date.now()}`;
  await addManualVersion(page, label);

  await clickVersionRow(page, label);
  await expect(page.getByTestId("version-viewing-banner")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByTestId("version-viewing-return").click();
  await expect(page.getByTestId("version-viewing-banner")).toHaveCount(0);

  // Typing should work again.
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" more");
  const content = await page.evaluate(() => {
    const get = (window as unknown as Record<string, unknown>)[
      "__ohWritersFountain"
    ] as (() => string) | undefined;
    return get?.() ?? "";
  });
  expect(content).toContain("more");
});

// ─── OHW-153  Ripristina questa versione restores + exits view mode ──────────

test("[OHW-153] Ripristina questa versione closes banner and makes editor editable", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await typeIntoEditor(page, "INT. OFFICE - DAY");
  await forceSave(page);
  await openVersionsPanel(page);
  const label = `V153-${Date.now()}`;
  await addManualVersion(page, label);

  await clickVersionRow(page, label);
  await expect(page.getByTestId("version-viewing-banner")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByTestId("version-viewing-restore").click();
  await expect(page.getByTestId("version-viewing-banner")).toHaveCount(0);

  // Editor should now be editable
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" restored");
  const content = await page.evaluate(() => {
    const get = (window as unknown as Record<string, unknown>)[
      "__ohWritersFountain"
    ] as (() => string) | undefined;
    return get?.() ?? "";
  });
  expect(content).toContain("restored");
});

// ─── OHW-154  Entering view mode on a dirty draft preserves unsaved content ──
//
// View mode entry is non-destructive: the live draft (including unsaved edits)
// is captured into savedContent and restored when the user returns.
// No confirmation dialog is shown.

test("[OHW-154] entering view mode with unsaved changes — returning restores unsaved content", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await typeIntoEditor(page, "INT. OFFICE - DAY");
  await forceSave(page);
  await openVersionsPanel(page);
  const label = `V154-${Date.now()}`;
  await addManualVersion(page, label);

  // Make the draft dirty (type without saving)
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" UNSAVED");

  await clickVersionRow(page, label);

  // Banner should appear — no confirmation dialog was needed
  await expect(page.getByTestId("version-viewing-banner")).toBeVisible({
    timeout: 10_000,
  });

  // Return to the live draft
  await page.getByTestId("version-viewing-return").click();
  await expect(page.getByTestId("version-viewing-banner")).toHaveCount(0);

  // Unsaved content must be preserved
  const content = await page.evaluate(() => {
    const get = (window as unknown as Record<string, unknown>)[
      "__ohWritersFountain"
    ] as (() => string) | undefined;
    return get?.() ?? "";
  });
  expect(content).toContain("UNSAVED");
});

// ─── OHW-155  No autosave while viewing ──────────────────────────────────────

test("[OHW-155] autosave suspended during view mode: no saveScreenplay calls", async ({
  page,
}) => {
  await openScreenplay(page, projectId);
  await typeIntoEditor(page, "INT. OFFICE - DAY");
  await forceSave(page);
  await openVersionsPanel(page);
  const label = `V155-${Date.now()}`;
  await addManualVersion(page, label);

  await clickVersionRow(page, label);
  await expect(page.getByTestId("version-viewing-banner")).toBeVisible({
    timeout: 10_000,
  });

  // Track saveScreenplay calls from this point on
  const saveCalls: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("saveScreenplay")) saveCalls.push(url);
  });

  // Wait past the 2s autosave debounce window
  await page.waitForTimeout(3000);

  expect(saveCalls).toHaveLength(0);
});
