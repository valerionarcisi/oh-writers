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
import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, waitForEditor, getEditorContent } from "../helpers";

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";
const PDF_FIXTURE = path.resolve(
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
 */
async function importPdf(page: Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /import pdf/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
}

/**
 * Confirm the "Replace content?" dialog that appears when importing into a
 * screenplay that already has content.
 */
async function confirmReplace(page: Page) {
  await page.getByRole("button", { name: /replace/i }).click();
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
  await page.goto(`${BASE_URL}/`);

  await page.getByRole("button", { name: /new project/i }).click();
  await page.getByLabel(/title/i).fill("The Wolf");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/projects\//);
  projectId = page.url().split("/projects/")[1]?.split("/")[0] ?? "";
  await page.close();
});

// ─── OHW-070  Import PDF button is visible in the screenplay toolbar ──────────

test("[OHW-070] Import PDF button is visible in toolbar", async ({
  browser,
}) => {
  test.todo(); // feature not yet implemented
});

// ─── OHW-071  File picker opens on button click ───────────────────────────────

test("[OHW-071] Clicking Import PDF opens the system file picker", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-072  Importing into an empty screenplay replaces content silently ────

test("[OHW-072] Import into empty screenplay loads content without confirmation dialog", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-073  Importing into a non-empty screenplay shows a confirmation dialog

test("[OHW-073] Import into non-empty screenplay shows replace-content confirmation", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-074  Cancelling the confirmation keeps existing content unchanged ────

test("[OHW-074] Cancelling the replace dialog keeps existing content unchanged", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-075  Scene headings are parsed correctly ─────────────────────────────
//
// Input (page 1):  "2    INT. STRATTON OAKMONT III – BULLPEN – DAY    (FEB '95)    2"
// Expected node:   scene_heading  prefix="INT."  title="STRATTON OAKMONT III – BULLPEN – DAY"
// Stripped:        leading scene number "2", trailing scene number "2", date "(FEB '95)"

test("[OHW-075] Scene headings are imported as scene_heading nodes without scene numbers or date annotations", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-076  Character cue — plain name ──────────────────────────────────────
//
// Input:     "JORDAN"
// Expected:  character node  name="JORDAN"  extension=null

test("[OHW-076] Plain character cue is imported as character node with no extension", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-077  Character cue — with single extension ──────────────────────────
//
// Input:     "JORDAN (CONT'D)"
// Expected:  character node  text="JORDAN (CONT'D)"
//
// The character node is a plain text block — no sub-slots. The full string
// including the parenthetical extension is stored verbatim.

test("[OHW-077] Character cue with extension is imported as character node containing the full text", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-078  Character cue — with compound extension (V.O. + CONT'D) ─────────
//
// Input:     "JORDAN (V.O.) (CONT'D)"
// Expected:  character node  text="JORDAN (V.O.) (CONT'D)"
//
// The parser must not split this into two nodes. The entire raw string becomes
// the text content of one character block.

test("[OHW-078] Character cue with compound extensions is one character node containing the full raw text", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-079  Character cue — off-screen extension ────────────────────────────
//
// Input:     "CLIENT #1 (O.S.)"  (page 8)
// Expected:  character node  text="CLIENT #1 (O.S.)"

test("[OHW-079] Character cue with O.S. extension is imported as character node with full text", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-080  Dialogue lines ──────────────────────────────────────────────────
//
// Input (immediately after "JORDAN"):
//   "Twenty five grand to the first"
//   "cocksucker to nail a bullseye!"
// Expected: dialogue node containing both lines as one block

test("[OHW-080] Dialogue lines following a character cue are imported as a single dialogue node", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-081  Parenthetical ───────────────────────────────────────────────────
//
// Input (page 4, inside TERESA dialogue block):  "(a few beats; then)"
// Input (page 4, standalone):                   "(ALT)"
// Expected: parenthetical node in both cases

test("[OHW-081] Parenthetical lines (surrounded by parentheses) are imported as parenthetical nodes", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-082  Action lines ───────────────────────────────────────────────────
//
// Input:  "Absolute bedlam. 300 drunken STOCKBROKERS, most in their..."
// Expected: action node

test("[OHW-082] Descriptive action lines are imported as action nodes", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-083  Transitions (CUT TO:) ──────────────────────────────────────────
//
// Input (page 8):  "58A    CUT TO:    58A"
// Expected:        transition node  text="CUT TO:"
//
// The scene number fragments ("58A") on both sides are stripped. Only the
// "CUT TO:" text survives as a transition block. Clicking on it in the editor
// must show the element pill labelled "Transition".

test("[OHW-083] CUT TO: lines are imported as transition nodes with scene numbers stripped", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-084  Clicking on an imported transition shows the Transition pill ────

test("[OHW-084] Clicking on an imported transition block shows the 'Transition' element pill", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-085  Parasitic text stripped — Buff Revised Pages header ─────────────
//
// Input:  "The Wolf of Wall Street    Buff Revised Pages    3/5/13"
// Expected: this line does not appear anywhere in the imported content

test("[OHW-085] 'Buff Revised Pages' header lines are stripped from imported content", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.context().addCookies(authCookies);
  await page.goto(`${BASE_URL}/projects/${projectId}`);
  const editor = await waitForEditor(page);
  await importPdf(page, PDF_FIXTURE);
  await confirmReplace(page);
  await page.waitForTimeout(2_000); // wait for import to complete

  const fountain = await getEditorContent(page);
  expect(fountain).not.toContain("Buff Revised Pages");
  expect(fountain).not.toContain("3/5/13");
  await page.close();
});

// ─── OHW-086  Parasitic text stripped — bare page numbers ─────────────────────
//
// Standalone lines that are just a number followed by a period ("2.", "21."…)
// appear as page footers in the PDF and must not appear in the editor.

test("[OHW-086] Bare page-number lines (e.g. '2.', '21.') are stripped from imported content", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-087  Parasitic text stripped — revision asterisks ────────────────────
//
// Asterisks at the end of lines ("*") and standalone scene-number+asterisk
// fragments ("* 42", "*46A") are revision marks that must not appear in the
// editor content.

test("[OHW-087] Revision asterisks at the end of lines are stripped during import", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-088  Edge case — OMITTED scene block ────────────────────────────────
//
// Input (page 4):  "42    SCENES 42 – 46 OMITTED    * 42"
// Decision:        preserved as an action block so the writer knows scenes were
//                  intentionally omitted. Text becomes "SCENES 42 – 46 OMITTED"
//                  (scene number and asterisk stripped).

test("[OHW-088] OMITTED scene blocks are preserved as action nodes with numbers and asterisks stripped", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-089  Edge case — INSERT PHOTO slug ───────────────────────────────────
//
// Input (page 4):  "46A    INSERT ID PHOTO – TOBY WELCH    *46A"
// Decision:        treated as a scene_heading (INSERT is a valid Fountain slug
//                  prefix). Scene number ("46A") and asterisk stripped.
//                  Result:  scene_heading  prefix="INSERT"  title="ID PHOTO – TOBY WELCH"

test("[OHW-089] INSERT ID PHOTO lines are imported as scene_heading nodes", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-090  Post-import interaction — edit scene heading title ──────────────
//
// The user clicks into a scene heading title cell and types a correction.
// The block must remain typed as scene_heading (not revert to action).

test("[OHW-090] Editing an imported scene heading title keeps the block as scene_heading", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-091  Post-import interaction — add character below action ─────────────
//
// The user places the cursor in an imported action block and presses Alt+c to
// create a new character line. The shortcut must work on imported content
// identically to hand-typed content.

test("[OHW-091] Alt+c shortcut creates a character block after an imported action block", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-092  Post-import interaction — element pill on transition ────────────
//
// Already covered by OHW-084 but this test explicitly verifies the element
// selector dropdown can be used to change the element type of an imported
// transition (proving the block is not locked/read-only).

test("[OHW-092] Element type of an imported transition can be changed via the element selector", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-093  File too large — error message ──────────────────────────────────

test("[OHW-093] Importing a PDF larger than 10 MB shows an error message", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-094  Encrypted PDF — error message ───────────────────────────────────

test("[OHW-094] Importing a password-protected PDF shows an appropriate error message", async ({
  browser,
}) => {
  test.todo();
});

// ─── OHW-095  Non-PDF file — error message ────────────────────────────────────

test("[OHW-095] Uploading a non-PDF file shows 'not a valid PDF' error", async ({
  browser,
}) => {
  test.todo();
});
