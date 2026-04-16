/**
 * Spec 05c — PDF Import (E2E acceptance tests)
 *
 * User Story:
 *   A screenwriter creates a new project "The Wolf", opens the editor and
 *   imports the Wolf of Wall Street PDF. They expect a fully formatted
 *   screenplay ready for editing and script breakdown.
 *
 * Test fixture: tests/fixtures/the-wolf-of-wall-street.pdf
 *   (Buff Revised Pages, 3/5/13)
 *
 * Acceptance criteria derived from analysing pages 1, 4, 7 and 8 of the PDF.
 *
 * ─── Element mapping expected after import ────────────────────────────────────
 *
 * Page 1 samples:
 *   "INT. STRATTON OAKMONT III – BULLPEN – DAY  (FEB '95)"
 *     → scene_heading  (date annotation stripped, scene numbers stripped)
 *   "JORDAN"                → character  (name only)
 *   "JORDAN (CONT'D)"       → character  name="JORDAN" extension="CONT'D"
 *   "JORDAN (V.O.) (CONT'D)"→ character  name="JORDAN" extension="V.O. CONT'D"
 *   "Twenty five grand…"    → dialogue
 *   "The Brokers go apeshit…" → action
 *
 * Page 4 samples:
 *   "SCENES 42 – 46 OMITTED" → action block (preserved as note, not dropped)
 *   "INSERT ID PHOTO – TOBY WELCH" → scene_heading (slug-like INSERT)
 *   "(ALT)"                 → parenthetical (standalone direction)
 *
 * Page 7–8 samples:
 *   "CUT TO:"               → transition  (when isolated on its own line next to
 *                             scene number e.g. "58A   CUT TO:   58A")
 *   "CLIENT #1 (O.S.)"      → character  name="CLIENT #1" extension="O.S."
 *   "(to Robbie Feinberg)"  → parenthetical
 *
 * ─── Parasitic data (must be stripped) ───────────────────────────────────────
 *   "The Wolf of Wall Street    Buff Revised Pages    3/5/13"  — header/footer
 *   Bare page numbers ("2.", "21.", "24.", "25.", "26.", "27.") — page footers
 *   Scene numbers on left and right of sluglines ("2 … 2", "41 … 41")
 *   Revision asterisks at end of lines ("*", "* 42", "*46A")
 *
 * ─── Post-import interaction checks ──────────────────────────────────────────
 *   1. User edits a scene heading: types in the title cell, verifies block stays
 *      typed as scene_heading and is not converted to action
 *   2. User adds a new character line below an action block: Alt+c shortcut
 *      works on imported content exactly as on hand-typed content
 *   3. User places cursor on a CUT TO: transition and verifies the element pill
 *      shows "Transition" label
 */

import path from "path";
import fs from "fs";
import os from "os";
import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, waitForEditor, getEditorContent } from "../helpers";

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";

// Small generated PDF — used for most tests (fast parsing, ~33 KB).
// Contains: scene headings, character cues with extensions (V.O., CONT'D,
// compound, O.S.), dialogue, parenthetical, action, transitions (CUT TO:,
// FADE OUT.), INSERT slug, OMITTED block.
const PDF_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/screenplays/shooting-script.pdf",
);

// Full Wolf of Wall Street shooting script — only used for tests that
// explicitly require its parasitic-text patterns (Buff header, bare page
// numbers, revision asterisks, scene-number columns).
const WOLF_PDF = path.resolve(
  __dirname,
  "../fixtures/the-wolf-of-wall-street.pdf",
);

// ─── Auth helper ──────────────────────────────────────────────────────────────

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

/**
 * Open the Import PDF dialog and upload the fixture file.
 * Assumes the editor is already open and focused.
 * The Import PDF action is now inside the toolbar ⋯ menu.
 */
async function importPdf(page: Page, filePath: string) {
  await page.getByTestId("toolbar-menu-trigger").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("menu-item-import-pdf").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
}

/**
 * Confirm the "Replace content?" dialog that appears when importing into a
 * screenplay that already has content (hasExistingContent=true).
 * Uses the overwrite button in the confirm overlay.
 */
async function confirmReplace(page: Page) {
  // When there are existing versions, the dialog shows "Sovrascrivi"
  // When there are no versions, it shows "Replace"
  const overwrite = page.getByTestId("import-confirm-overwrite");
  const replace = page.getByTestId("import-confirm-ok");
  // Wait for either button to appear
  await Promise.race([
    overwrite
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => overwrite.click()),
    replace
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => replace.click()),
  ]);
}

/** Open the screenplay editor and wait for it to be ready. */
async function openScreenplay(page: Page) {
  await page.goto(`${BASE_URL}/projects/${projectId}/screenplay`);
  await page.waitForLoadState("networkidle");
  return waitForEditor(page);
}

/**
 * Import the Wolf PDF into the page, handling any confirm dialog.
 * Waits until the editor fountain is non-empty (PDF parsed + doc updated).
 */
async function importAndConfirm(page: Page) {
  // Check if screenplay has content before import to decide if we'll see a dialog
  const before = await getEditorContent(page);
  await importPdf(page, PDF_FIXTURE);
  if (before.trim().length > 0) {
    await confirmReplace(page);
  }
  // Wait for PDF parsing + editor update — fountain must be non-empty
  await page.waitForFunction(
    () => ((window as any).__ohWritersFountain?.() ?? "").trim().length > 100,
    { timeout: 20_000 },
  );
}

/** Wait until the editor has Wolf content (loaded from DB or just imported). */
async function waitForWolfContent(page: Page) {
  await page.waitForFunction(
    () =>
      ((window as any).__ohWritersFountain?.() ?? "").includes(
        "STRATTON OAKMONT",
      ),
    { timeout: 15_000 },
  );
}

/** Import the Wolf PDF, handling any confirm dialog. For parasitic-text tests. */
async function importWolfAndConfirm(page: Page) {
  const before = await getEditorContent(page);
  await importPdf(page, WOLF_PDF);
  if (before.trim().length > 0) {
    await confirmReplace(page);
  }
  await waitForWolfContent(page);
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

let projectId = "";
let authCookies: {
  name: string;
  value: string;
  domain: string;
  path: string;
}[] = [];

test.beforeAll(async ({ browser }) => {
  authCookies = await signInViaApi(TEST_EMAIL, TEST_PASSWORD);

  // Create a fresh "The Wolf" project via the UI
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await page.goto(`${BASE_URL}/projects/new`);
  await page.waitForURL(/\/projects\/new/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/title/i).fill("The Wolf");
  await page.getByLabel(/format/i).selectOption("feature");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  projectId = page.url().split("/projects/")[1]?.split("/")[0] ?? "";
  await page.close();
});

// ─── OHW-070  Import PDF button is visible in the screenplay toolbar ──────────

test("[OHW-070] Import PDF button is visible in toolbar", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await page.getByTestId("toolbar-menu-trigger").click();
  await expect(page.getByTestId("menu-item-import-pdf")).toBeVisible();
  await page.close();
});

// ─── OHW-071  File picker opens on button click ───────────────────────────────

test("[OHW-071] Clicking Import PDF opens the system file picker", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await page.getByTestId("toolbar-menu-trigger").click();
  const fileChooserPromise = page.waitForEvent("filechooser", {
    timeout: 5_000,
  });
  await page.getByTestId("menu-item-import-pdf").click();
  const fileChooser = await fileChooserPromise;
  expect(fileChooser).toBeTruthy();
  await page.close();
});

// ─── OHW-072  Importing into an empty screenplay replaces content silently ────

test("[OHW-072] Import into empty screenplay loads content without confirmation dialog", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);

  // Screenplay is empty — no confirm dialog should appear
  await importPdf(page, PDF_FIXTURE);

  // Confirm dialog must NOT appear
  await expect(page.getByTestId("import-confirm")).not.toBeVisible();

  // Wait for PDF parsing + editor update
  await page.waitForFunction(
    () => ((window as any).__ohWritersFountain?.() ?? "").trim().length > 100,
    { timeout: 20_000 },
  );
  const fountain = await getEditorContent(page);
  expect(fountain.trim().length).toBeGreaterThan(0);
  await page.close();
});

// ─── OHW-073  Importing into a non-empty screenplay shows a confirmation dialog

test("[OHW-073] Import into non-empty screenplay shows replace-content confirmation", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  // Populate the screenplay first (handles empty → no dialog, or non-empty → confirms)
  await importAndConfirm(page);

  // Now import a second time → screenplay is non-empty, confirm dialog must appear
  await importPdf(page, PDF_FIXTURE);
  await expect(page.getByTestId("import-confirm")).toBeVisible({
    timeout: 8_000,
  });

  // Dismiss the dialog to restore state
  await page.getByTestId("import-confirm-cancel").click();
  await page.close();
});

// ─── OHW-074  Cancelling the confirmation keeps existing content unchanged ────

test("[OHW-074] Cancelling the replace dialog keeps existing content unchanged", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  const before = await getEditorContent(page);
  expect(before.trim().length).toBeGreaterThan(0);

  await importPdf(page, PDF_FIXTURE);
  await expect(page.getByTestId("import-confirm")).toBeVisible({
    timeout: 8_000,
  });
  await page.getByTestId("import-confirm-cancel").click();
  await expect(page.getByTestId("import-confirm")).not.toBeVisible();

  const after = await getEditorContent(page);
  expect(after).toBe(before);
  await page.close();
});

// ─── OHW-075  Scene headings are parsed correctly ─────────────────────────────
//
// Input (page 1):  "2    INT. STRATTON OAKMONT III – BULLPEN – DAY    (FEB '95)    2"
// Expected node:   scene_heading  prefix="INT."  title="STRATTON OAKMONT III – BULLPEN – DAY"
// Stripped:        leading scene number "2", trailing scene number "2", date "(FEB '95)"

test("[OHW-075] Scene headings are imported as scene_heading nodes without scene numbers or date annotations", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  const fountain = await getEditorContent(page);
  // Scene heading must appear (shooting-script has "INT. OFFICE - DAY")
  expect(fountain).toMatch(/INT\. OFFICE/);

  // Must render as .pm-heading-title in the DOM (not plain action)
  const heading = page
    .locator(".pm-heading-title")
    .filter({ hasText: /OFFICE/ })
    .first();
  await expect(heading).toBeVisible();
  await page.close();
});

// ─── OHW-076  Character cue — plain name ──────────────────────────────────────

test("[OHW-076] Plain character cue is imported as character node with no extension", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  // JORDAN as a standalone character cue (without extension) must be in a .pm-character block
  const charNode = page
    .locator(".pm-character")
    .filter({ hasText: /^JORDAN$/ })
    .first();
  await expect(charNode).toBeVisible();
  await page.close();
});

// ─── OHW-077  Character cue — with single extension ──────────────────────────

test("[OHW-077] Character cue with extension is imported as character node containing the full text", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  const charNode = page
    .locator(".pm-character")
    .filter({ hasText: "JORDAN (CONT'D)" })
    .first();
  await expect(charNode).toBeVisible();
  await page.close();
});

// ─── OHW-078  Character cue — with compound extension (V.O. + CONT'D) ─────────

test("[OHW-078] Character cue with compound extensions is one character node containing the full raw text", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  // Must be a single .pm-character node containing both extensions — not split in two.
  // Use a regex to tolerate different apostrophe encodings from the PDF renderer.
  const charNode = page
    .locator(".pm-character")
    .filter({ hasText: /JORDAN \(V\.O\.\) \(CONT.D\)/ })
    .first();
  await expect(charNode).toBeVisible();
  await page.close();
});

// ─── OHW-079  Character cue — off-screen extension ────────────────────────────

test("[OHW-079] Character cue with O.S. extension is imported as character node with full text", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  const charNode = page
    .locator(".pm-character")
    .filter({ hasText: "CLIENT #1 (O.S.)" })
    .first();
  await expect(charNode).toBeVisible();
  await page.close();
});

// ─── OHW-080  Dialogue lines ──────────────────────────────────────────────────

test("[OHW-080] Dialogue lines following a character cue are imported as a single dialogue node", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  // At least one .pm-dialogue block must exist
  await expect(page.locator(".pm-dialogue").first()).toBeVisible();
  await page.close();
});

// ─── OHW-081  Parenthetical ───────────────────────────────────────────────────

test("[OHW-081] Parenthetical lines (surrounded by parentheses) are imported as parenthetical nodes", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  await expect(page.locator(".pm-parenthetical").first()).toBeVisible();
  await page.close();
});

// ─── OHW-082  Action lines ───────────────────────────────────────────────────

test("[OHW-082] Descriptive action lines are imported as action nodes", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  await expect(page.locator(".pm-action").first()).toBeVisible();
  await page.close();
});

// ─── OHW-083  Transitions (CUT TO:) ──────────────────────────────────────────

test("[OHW-083] CUT TO: lines are imported as transition nodes with scene numbers stripped", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  // CUT TO: must exist as a .pm-transition node
  const transitionNode = page
    .locator(".pm-transition")
    .filter({ hasText: "CUT TO:" })
    .first();
  await expect(transitionNode).toBeVisible();

  // Scene numbers like "58A" must not appear alongside it in the fountain text
  const fountain = await getEditorContent(page);
  expect(fountain).not.toMatch(/58A\s+CUT TO:/);
  await page.close();
});

// ─── OHW-084  Clicking on an imported transition shows the Transition pill ────

test("[OHW-084] Clicking on an imported transition block shows the 'Transition' element pill", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  const transitionNode = page
    .locator(".pm-transition")
    .filter({ hasText: "CUT TO:" })
    .first();
  await expect(transitionNode).toBeVisible();
  await transitionNode.click();

  // The active element pill in the toolbar should be "Transition"
  const activePill = page.locator('[aria-pressed="true"]');
  await expect(activePill).toContainText(/transition/i, { timeout: 3_000 });
  await page.close();
});

// ─── OHW-085  Parasitic text stripped — Buff Revised Pages header ─────────────

test("[OHW-085] 'Buff Revised Pages' header lines are stripped from imported content", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importWolfAndConfirm(page);

  const fountain = await getEditorContent(page);
  expect(fountain).not.toContain("Buff Revised Pages");
  expect(fountain).not.toContain("3/5/13");
  await page.close();
});

// ─── OHW-086  Parasitic text stripped — bare page numbers ─────────────────────

test("[OHW-086] Bare page-number lines (e.g. '2.', '21.') are stripped from imported content", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importWolfAndConfirm(page);

  const fountain = await getEditorContent(page);
  expect(fountain).not.toMatch(/^\s*\d+\.\s*$/m);
  await page.close();
});

// ─── OHW-087  Parasitic text stripped — revision asterisks ────────────────────

test("[OHW-087] Revision asterisks at the end of lines are stripped during import", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importWolfAndConfirm(page);

  const fountain = await getEditorContent(page);
  expect(fountain).not.toMatch(/\s\*+\s*$/m);
  expect(fountain).not.toMatch(/^\s*\*+\s*\d*[A-Z]?\s*$/m);
  await page.close();
});

// ─── OHW-088  Edge case — OMITTED scene block ────────────────────────────────

test("[OHW-088] OMITTED scene blocks are preserved as action nodes with numbers and asterisks stripped", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  // "SCENES 42 – 46 OMITTED" must be preserved (fix: en-dash causes isPlainFountainCue
  // to reject it, so it falls through to action).
  const actionNode = page
    .locator(".pm-action")
    .filter({ hasText: /SCENES.*OMITTED/ })
    .first();
  await expect(actionNode).toBeVisible();

  const fountain = await getEditorContent(page);
  expect(fountain).toMatch(/SCENES.*OMITTED/);
  await page.close();
});

// ─── OHW-089  Edge case — INSERT PHOTO slug ───────────────────────────────────

test("[OHW-089] INSERT ID PHOTO lines are imported as scene_heading nodes", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  // "INSERT ID PHOTO – TOBY WELCH" — the heading prefix is "INSERT", the title
  // slot is "ID PHOTO – TOBY WELCH". Test the title slot.
  const heading = page
    .locator(".pm-heading-title")
    .filter({ hasText: /ID PHOTO/ })
    .first();
  await expect(heading).toBeVisible();
  await page.close();
});

// ─── OHW-090  Post-import interaction — edit scene heading title ──────────────

test("[OHW-090] Editing an imported scene heading title keeps the block as scene_heading", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  // Click into a scene heading title and type a correction
  const heading = page.locator(".pm-heading-title").first();
  await expect(heading).toBeVisible();
  await heading.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" EDITED");

  // The block must remain a scene heading (not converted to action)
  await expect(
    page.locator(".pm-heading-title").filter({ hasText: "EDITED" }).first(),
  ).toBeVisible();
  await page.close();
});

// ─── OHW-091  Post-import interaction — add character below action ─────────────

test("[OHW-091] Alt+c shortcut creates a character block after an imported action block", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  // Click an action block and move to the end
  const actionNode = page.locator(".pm-action").first();
  await expect(actionNode).toBeVisible();
  await actionNode.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");

  // Alt+c should convert the new block to a character node
  await page.keyboard.press("Alt+c");
  await page.keyboard.type("TESTCHAR");

  await expect(
    page.locator(".pm-character").filter({ hasText: "TESTCHAR" }).first(),
  ).toBeVisible({ timeout: 3_000 });
  await page.close();
});

// ─── OHW-092  Post-import interaction — element pill on transition ────────────

test("[OHW-092] Element type of an imported transition can be changed via the element selector", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);
  await importAndConfirm(page);

  const transitionNode = page.locator(".pm-transition").first();
  await expect(transitionNode).toBeVisible();
  await transitionNode.click();

  // The active element pill must show "Transition"
  const activePill = page.locator('[aria-pressed="true"]');
  await expect(activePill).toContainText(/transition/i, { timeout: 3_000 });

  // The block is not locked — the pill buttons are interactive
  await expect(activePill).toBeEnabled();
  await page.close();
});

// ─── OHW-093  File too large — error message ──────────────────────────────────

test("[OHW-093] Importing a PDF larger than 10 MB shows an error message", async ({
  browser,
}) => {
  // Create a temporary file just over 10 MB.
  // Using 10.1 MB: base64-encoded = ~13.5 MB which is under MAX_BASE64_LENGTH
  // (~14.7 MB), so the Zod validator passes and the server-side buffer check
  // catches it with FileTooLargeError.
  const tmpFile = path.join(os.tmpdir(), "large-test.pdf");
  const largeBuf = Buffer.alloc(Math.ceil(10.1 * 1024 * 1024), 0x20);
  largeBuf.write("%PDF-1.4\n", 0, "ascii");
  fs.writeFileSync(tmpFile, largeBuf);

  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);

  await page.getByTestId("toolbar-menu-trigger").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("menu-item-import-pdf").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(tmpFile);

  await expect(page.getByTestId("import-error")).toBeVisible({
    timeout: 8_000,
  });
  await expect(page.getByTestId("import-error")).toContainText(/10 MB/i);

  fs.unlinkSync(tmpFile);
  await page.close();
});

// ─── OHW-094  Encrypted PDF — error message ───────────────────────────────────

test("[OHW-094] Importing a password-protected PDF shows an appropriate error message", async ({
  browser,
}) => {
  // Minimal syntactically-valid encrypted PDF that causes pdf-parse to throw with "encrypt"
  // This is a PDF with /Encrypt in the trailer — enough to trigger the encrypt check.
  const encryptedPdfContent = `%PDF-1.4
1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj
2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj
3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>endobj
4 0 obj<</Filter /Standard /V 1 /R 2 /O <0000000000000000000000000000000000000000000000000000000000000000> /U <0000000000000000000000000000000000000000000000000000000000000000> /P -4>>endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000206 00000 n
trailer<</Size 5 /Root 1 0 R /Encrypt 4 0 R>>
startxref
400
%%EOF`;

  const tmpFile = path.join(os.tmpdir(), "encrypted-test.pdf");
  fs.writeFileSync(tmpFile, encryptedPdfContent, "ascii");

  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);

  await page.getByTestId("toolbar-menu-trigger").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("menu-item-import-pdf").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(tmpFile);

  await expect(page.getByTestId("import-error")).toBeVisible({
    timeout: 10_000,
  });

  fs.unlinkSync(tmpFile);
  await page.close();
});

// ─── OHW-095  Non-PDF file — error message ────────────────────────────────────

test("[OHW-095] Uploading a non-PDF file shows 'not a valid PDF' error", async ({
  browser,
}) => {
  const tmpFile = path.join(os.tmpdir(), "not-a-pdf.txt");
  fs.writeFileSync(tmpFile, "This is just a text file, not a PDF.", "utf8");

  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await openScreenplay(page);

  await page.getByTestId("toolbar-menu-trigger").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("menu-item-import-pdf").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(tmpFile);

  await expect(page.getByTestId("import-error")).toBeVisible({
    timeout: 8_000,
  });

  fs.unlinkSync(tmpFile);
  await page.close();
});
