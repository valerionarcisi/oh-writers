/**
 * Spec 07c — PDF Import Pass 0 (title-page extraction)
 *
 * The PDF import pipeline runs an extra "Pass 0" before fountain conversion to
 * isolate and structure the title page. This spec covers the user-visible
 * behaviour:
 *
 *   - PDF carries a title page + project's front page is empty
 *       → title page is applied transparently, no modal.
 *   - PDF carries a title page + project's front page is non-empty
 *       → "Frontespizio importato dal PDF" modal asks before overwriting.
 *   - PDF has no title page (slugline on line 1)
 *       → modal never appears.
 *
 * Fixtures live in `tests/fixtures/screenplays/`:
 *   - with-title-page.pdf       (centered visual title page)
 *   - fountain-style-title.pdf  (key:value title page rendered through afterwriting)
 *   - no-title-page.pdf         (starts with INT. directly)
 */
import path from "path";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { BASE_URL, waitForEditor, getEditorContent } from "../helpers";

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";

const FIXTURE = (name: string) =>
  path.resolve(__dirname, "../fixtures/screenplays", name);

const WITH_TITLE_PAGE_PDF = FIXTURE("with-title-page.pdf");
const FOUNTAIN_TITLE_PDF = FIXTURE("fountain-style-title.pdf");
const NO_TITLE_PAGE_PDF = FIXTURE("no-title-page.pdf");

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createFreshProject(
  context: BrowserContext,
  title: string,
): Promise<string> {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/projects/new`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/title/i).fill(title);
  await page.getByLabel(/format/i).selectOption("feature");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const id = page.url().split("/projects/")[1]?.split("/")[0] ?? "";
  await page.close();
  return id;
}

async function openScreenplay(page: Page, projectId: string) {
  await page.goto(`${BASE_URL}/projects/${projectId}/screenplay`);
  await page.waitForLoadState("networkidle");
  await waitForEditor(page);
}

async function importPdf(page: Page, filePath: string) {
  await page.getByTestId("toolbar-menu-trigger").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("menu-item-import-pdf").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
}

async function waitForFountainNonEmpty(page: Page) {
  await page.waitForFunction(
    () => ((window as any).__ohWritersFountain?.() ?? "").trim().length > 50,
    { timeout: 20_000 },
  );
}

async function confirmReplaceContent(page: Page) {
  const overwrite = page.getByTestId("import-confirm-overwrite");
  const replace = page.getByTestId("import-confirm-ok");
  await Promise.race([
    overwrite
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => overwrite.click()),
    replace
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => replace.click()),
  ]);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

let authCookies: {
  name: string;
  value: string;
  domain: string;
  path: string;
}[] = [];

test.beforeAll(async () => {
  authCookies = await signInViaApi(TEST_EMAIL, TEST_PASSWORD);
});

// ─── OHW-FP30 ────────────────────────────────────────────────────────────────
// Empty project + PDF with title page → applied silently, no modal.

test("[OHW-FP30] PDF with title page into empty project applies the front page silently", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addCookies(authCookies);
  const projectId = await createFreshProject(context, "FP30 silent apply");

  const page = await context.newPage();
  await openScreenplay(page, projectId);

  await importPdf(page, WITH_TITLE_PAGE_PDF);
  await waitForFountainNonEmpty(page);

  // The title-page-confirm modal must NOT appear for an empty front page.
  await expect(page.getByTestId("imported-titlepage-confirm")).toHaveCount(0);

  // Sanity: the body of the screenplay was imported.
  const fountain = await getEditorContent(page);
  expect(fountain).toMatch(/INT\. APARTMENT/);

  await context.close();
});

// ─── OHW-FP31 ────────────────────────────────────────────────────────────────
// Project already has a title page + new PDF with title page → confirm modal.

test("[OHW-FP31] Importing a PDF with a title page over an existing one prompts to overwrite", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addCookies(authCookies);
  const projectId = await createFreshProject(context, "FP31 overwrite confirm");

  const page = await context.newPage();
  await openScreenplay(page, projectId);

  // First import populates both screenplay AND title page silently.
  await importPdf(page, WITH_TITLE_PAGE_PDF);
  await waitForFountainNonEmpty(page);
  await expect(page.getByTestId("imported-titlepage-confirm")).toHaveCount(0);

  // Second import: screenplay is now non-empty AND has a title page.
  await importPdf(page, FOUNTAIN_TITLE_PDF);

  // Replace-content modal first (existing screenplay).
  await confirmReplaceContent(page);

  // Now the title-page-confirm modal appears.
  await expect(page.getByTestId("imported-titlepage-confirm")).toBeVisible({
    timeout: 15_000,
  });

  // Confirming closes it.
  await page.getByTestId("imported-titlepage-confirm-confirm").click();
  await expect(page.getByTestId("imported-titlepage-confirm")).toHaveCount(0);

  await context.close();
});

// ─── OHW-FP32 ────────────────────────────────────────────────────────────────
// PDF without a title page → modal never appears.

test("[OHW-FP32] Importing a PDF that has no title page never shows the front-page confirm", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addCookies(authCookies);
  const projectId = await createFreshProject(context, "FP32 no title page");

  const page = await context.newPage();
  await openScreenplay(page, projectId);

  await importPdf(page, NO_TITLE_PAGE_PDF);
  await waitForFountainNonEmpty(page);

  await expect(page.getByTestId("imported-titlepage-confirm")).toHaveCount(0);

  // The body still imported correctly.
  const fountain = await getEditorContent(page);
  expect(fountain).toMatch(/INT\. ROOM/);

  await context.close();
});
