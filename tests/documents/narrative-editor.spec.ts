/**
 * Spec 04 — Narrative Editor E2E (logline, synopsis, treatment)
 *
 * Spec 04f/55 realigned the surfaces: the logline is authored in the Soggetto
 * page via the LoglinePill (a popover textarea); synopsis/treatment/outline use
 * the ProseMirror NarrativeEditor (`rich-text-editor`). The standalone
 * `/logline` route now redirects to Soggetto, so role-guard + navigation tests
 * run on the real PM surfaces (Synopsis/Treatment).
 *
 * Blocco 1 — content caps:
 *   [205] Logline pill textarea refuses input past 200 chars (HTML maxLength)
 *
 * Blocco 2 — role guard (team projects, on the Synopsis PM surface):
 *   [211] Viewer sees read-only UI: PM surface non-editable, badge visible
 *   [212] Viewer raw save hits the server and gets rejected (ForbiddenError)
 *   [213] Owner on the same team project can save normally
 *
 * Blocco 3 — happy paths & navigation:
 *   [200] Unauthenticated user on a narrative doc is redirected to login
 *   [201] Owner opens a narrative doc → SaveStatus = "Saved" (not dirty)
 *   [202] Owner types → after debounce, autosave persists across reload
 *   [207] Synopsis: content round-trip after reload
 *   [208] Treatment: content round-trip after reload
 *   [209] Navigation between synopsis and treatment preserves both docs
 *   [214] SKIPPED — narrative Versions drawer is part of Spec 06b, not yet
 *             integrated into NarrativeEditor.
 *
 * Removed in the Spec 66/67 realignment: [204] (charCount warn class gone),
 * [206] + [210] (no "Error saving" SaveState — saved|saving|offline),
 * [203] (no manual Cmd/Ctrl+S flush — narrative docs are autosave-only).
 */

import { test, expect, TEST_TEAM_PROJECT_ID } from "../fixtures";
import { BASE_URL } from "../helpers";
import { reseedTestDb } from "../breakdown/helpers";
import {
  FAST_AUTOSAVE_SCRIPT,
  pmEditorLocator,
  focusPmEditor,
  readPmEditorText,
  waitForAutosave,
} from "../pm-editor-helpers";

// Mutator pays (#116): the content-caps test types a 250-char unbroken run
// of "x" into the shared seed doc. Left in place, narrative-export (the next
// file) embeds it in the PDF and pdf-parse v1 dies on any content-stream
// token over 128 chars ("Command token too long" — [226]/[231]).
test.afterAll(() => {
  reseedTestDb();
});

const SOGGETTO_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/soggetto`;
const SYNOPSIS_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/synopsis`;
const TREATMENT_PATH = (projectId: string) =>
  `${BASE_URL}/projects/${projectId}/treatment`;

// FAST_AUTOSAVE_SCRIPT, pmEditorLocator, focusPmEditor, readPmEditorText,
// and waitForAutosave now live in ../pm-editor-helpers (shared with
// teams/team-roles-collaboration.spec.ts).

// The SaveStatus moved to the shell-level indicator (SaveStatusIndicator →
// SavePill). Match by its stable testid + data-state so the assertion is
// locale-independent and survives CSS-module hashing.
const savedStatus = (page: import("@playwright/test").Page) =>
  page.locator('[data-testid="save-status-indicator"][data-state="saved"]');

test.describe("Narrative Editor — content caps", () => {
  // Spec 04f/55: the logline is authored in the Soggetto page via the LoglinePill
  // (a popover with a textarea), NOT a standalone /logline route. Open the pill
  // first, then assert on its editor.
  const openLoglinePill = async (page: import("@playwright/test").Page) => {
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("narrative-logline-pill").click();
    const editor = page.getByTestId("narrative-logline-editor");
    await expect(editor).toBeVisible({ timeout: 5_000 });
    return editor;
  };

  test("[205] logline editor refuses input past 200 chars", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SOGGETTO_PATH(testProjectId));
    const editor = await openLoglinePill(page);

    await editor.evaluate((el: HTMLTextAreaElement) => el.focus());
    await page.keyboard.type("x".repeat(250), { delay: 0 });

    const actualLength = await editor.evaluate(
      (el: HTMLTextAreaElement) => el.value.length,
    );
    expect(actualLength).toBe(200);
    expect(await editor.getAttribute("maxlength")).toBe("200");
  });

  // [206] removed: it asserted a "Error saving" SaveStatus state that no
  // longer exists (SaveState is saved|saving|offline — SavePill), and relied on a
  // raw-save hook not present on the Soggetto logline surface. The server-side
  // LOGLINE_MAX validation is covered by unit tests; the client cap is 205.
});

test.describe("Narrative Editor — role guard", () => {
  // Spec 04f/55: the narrative editor (synopsis/treatment/outline) renders a
  // ProseMirror surface — `rich-text-editor` with a contenteditable node that
  // PM marks non-editable when the viewer lacks write access. The legacy
  // textarea logline route was retired (it now redirects to Soggetto), so the
  // role guard is exercised on a real NarrativeEditor surface: Synopsis.
  const TEAM_SYNOPSIS_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/synopsis`;

  test("[211] viewer sees read-only UI on a team project", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(TEAM_SYNOPSIS_PATH);

    // For a viewer, PM marks the contenteditable node `false` — so we locate the
    // surface by its stable wrapper testid, not by `[contenteditable="true"]`.
    const editor = page.locator(
      '[data-testid="rich-text-editor"] [contenteditable]',
    );
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Read-only badge visible in the toolbar
    const badge = page.getByTestId("narrative-readonly-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/read only/i);

    // The PM surface is not editable for a viewer.
    await expect(editor).toHaveAttribute("contenteditable", "false");
  });

  test("[212] viewer raw save is rejected by the server", async ({
    authenticatedViewerPage: page,
  }) => {
    await page.goto(TEAM_SYNOPSIS_PATH);

    // The E2E save hook is installed even in read-only mode so we can
    // verify the server guard (the UI alone isn't proof).
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __ohWritersSaveDocumentRaw?: unknown })
          .__ohWritersSaveDocumentRaw === "function",
      undefined,
      { timeout: 10_000 },
    );

    await page.evaluate(() => {
      (
        window as unknown as {
          __ohWritersSaveDocumentRaw: (content: string) => void;
        }
      ).__ohWritersSaveDocumentRaw("viewer tried to overwrite this");
    });

    // Read-only mode doesn't render SaveStatus, so we assert via the
    // network response: saveDocument returns a ResultShape with the
    // ForbiddenError tag.
    const saveResp = await page.waitForResponse(
      (resp) =>
        resp.url().includes("saveDocument") &&
        resp.request().method() === "POST",
      { timeout: 10_000 },
    );
    const raw = await saveResp.text();
    const body = JSON.parse(raw) as unknown;
    // Tanstack Start wraps server fn returns in a few shapes depending on
    // the client; unwrap progressively until we find the ResultShape.
    const findShape = (
      input: unknown,
    ): { isOk: boolean; error?: { _tag?: string } } | null => {
      if (!input || typeof input !== "object") return null;
      const o = input as Record<string, unknown>;
      if ("isOk" in o && typeof o["isOk"] === "boolean") {
        return o as { isOk: boolean; error?: { _tag?: string } };
      }
      for (const v of Object.values(o)) {
        const found = findShape(v);
        if (found) return found;
      }
      return null;
    };
    const shape = findShape(body);
    expect(shape, `no ResultShape in: ${raw}`).not.toBeNull();
    expect(shape!.isOk).toBe(false);
    expect(shape!.error?._tag).toBe("ForbiddenError");
  });

  test("[213] owner can save on the same team project", async ({
    authenticatedPage: page,
  }) => {
    await page.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await page.goto(TEAM_SYNOPSIS_PATH);

    const editor = pmEditorLocator(page);
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Owner has full access → no read-only badge, PM surface is editable.
    await expect(page.getByTestId("narrative-readonly-badge")).toHaveCount(0);
    await expect(editor).toHaveAttribute("contenteditable", "true");

    // Edit → autosave (narrative docs are autosave-only, no manual flush).
    const marker = `owner-write-${Date.now()}`;
    await focusPmEditor(page);
    await page.keyboard.type(marker);
    await waitForAutosave(page);

    await expect(savedStatus(page)).toBeVisible({ timeout: 10_000 });

    // Round-trip: reload and verify the marker is persisted.
    await page.reload();
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });
    expect(await readPmEditorText(page)).toContain(marker);
  });
});

test.describe("Narrative Editor — happy paths & navigation", () => {
  test("[200] unauthenticated user on a narrative doc is redirected to login", async ({
    browser,
    testProjectId,
  }) => {
    // Fresh context, no cookies → the auth guard must redirect to /login.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(SYNOPSIS_PATH(testProjectId));
      await page.waitForURL(/\/login/, { timeout: 10_000 });
      expect(page.url()).toMatch(/\/login/);
    } finally {
      await context.close();
    }
  });

  test("[201] after an edit + save the SaveStatus reaches 'Saved'", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await page.goto(SYNOPSIS_PATH(testProjectId));

    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });

    // The save-status pill self-hides until the first real edit (it must not
    // flash a stale "Salvato" on an untouched page — NarrativeEditor only
    // publishes a state after `hasEdited`). So type, let autosave fire, then
    // assert "saved".
    await focusPmEditor(page);
    await page.keyboard.type(`saved-state-${Date.now()}`);
    await waitForAutosave(page);
    await expect(savedStatus(page)).toBeVisible({ timeout: 10_000 });
  });

  test("[202] typing triggers autosave after the debounce, persists on reload", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    // Shrink the 30s debounce to 300ms so the test can actually observe it.
    await page.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await page.goto(TREATMENT_PATH(testProjectId));

    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });

    // The pill self-hides until the first edit, so we can't wait for an initial
    // "Saved". Type the marker straight away; the autosave round-trip below is
    // the synchronisation point.
    const marker = `autosaved-${Date.now()}`;
    await focusPmEditor(page);
    await page.keyboard.type(marker);

    // Wait for the autosave network round-trip, then for SaveStatus.
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("saveDocument") &&
        resp.request().method() === "POST" &&
        resp.ok(),
      { timeout: 10_000 },
    );

    await expect(savedStatus(page)).toBeVisible({ timeout: 10_000 });

    // Critical: autosave persisted without any manual save action.
    await page.reload();
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });
    expect(await readPmEditorText(page)).toContain(marker);
  });

  // [203] removed: there is no manual Cmd/Ctrl+S flush on the narrative PM
  // surface — narrative docs are autosave-only (Spec 04e). The autosave path is
  // covered by 202; the "saved" pill transition by 201.

  test("[207] synopsis round-trips across reload", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await page.goto(SYNOPSIS_PATH(testProjectId));

    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });

    const marker = `synopsis-${Date.now()} — a short paragraph with punctuation, accents àèìòù, and emojis 🎬.`;
    await focusPmEditor(page);
    await page.keyboard.type(marker);
    await waitForAutosave(page);

    await expect(savedStatus(page)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });
    expect(await readPmEditorText(page)).toContain(marker);
  });

  test("[208] treatment round-trips across reload", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await page.goto(TREATMENT_PATH(testProjectId));

    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });

    // Multi-paragraph content to exercise the treatment path. Each "Enter"
    // creates a new <p> in PM; the round-trip joins them back via newlines.
    const stamp = `treatment-${Date.now()}`;
    const paragraphs = Array.from({ length: 5 }, (_, i) => `${stamp}-p${i}`);

    await focusPmEditor(page);
    for (let i = 0; i < paragraphs.length; i++) {
      await page.keyboard.type(paragraphs[i] ?? "");
      if (i < paragraphs.length - 1) await page.keyboard.press("Enter");
    }
    await waitForAutosave(page);

    await expect(savedStatus(page)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });
    const text = await readPmEditorText(page);
    for (const p of paragraphs) expect(text).toContain(p);
  });

  test("[209] navigating between synopsis and treatment preserves each", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.addInitScript(FAST_AUTOSAVE_SCRIPT);
    const synMarker = `synopsis-nav-${Date.now()} — keep me around`;
    const treatMarker = `treatment-nav-${Date.now()} — and me too`;

    // Write + autosave synopsis (PM editor).
    await page.goto(SYNOPSIS_PATH(testProjectId));
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });
    await focusPmEditor(page);
    await page.keyboard.type(synMarker);
    await waitForAutosave(page);
    await expect(savedStatus(page)).toBeVisible({ timeout: 10_000 });

    // Navigate to treatment (PM editor), write + autosave.
    await page.goto(TREATMENT_PATH(testProjectId));
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });
    await focusPmEditor(page);
    await page.keyboard.type(treatMarker);
    await waitForAutosave(page);
    await expect(savedStatus(page)).toBeVisible({ timeout: 10_000 });

    // Go back to synopsis — its content must still be synMarker.
    await page.goto(SYNOPSIS_PATH(testProjectId));
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });
    expect(await readPmEditorText(page)).toContain(synMarker);

    // And treatment still holds treatMarker.
    await page.goto(TREATMENT_PATH(testProjectId));
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });
    expect(await readPmEditorText(page)).toContain(treatMarker);
  });

  // [210] removed: SaveStatus no longer has an "Error saving" state
  // (SaveState is saved|saving|offline — SavePill). Failed saves surface
  // through the offline/retry path, not a distinct error pill.

  test("[N55] soggetto: the save pill survives a manual flush (stays 'saved', never unpublishes)", async ({
    authenticatedPage: page,
    testProjectId,
  }) => {
    await page.goto(SOGGETTO_PATH(testProjectId));
    await expect(pmEditorLocator(page)).toBeVisible({ timeout: 10_000 });

    const pill = page.getByTestId("save-status-indicator");
    // 58b2597b superseded the edit-gate this block used to assert (untouched →
    // no pill): the pill now publishes whenever the editor is enabled, starting
    // from "Salvato". What BUG-N45 still protects: caret moves without an edit
    // must not flip it dirty.
    await expect(pill).toBeVisible({ timeout: 10_000 });
    await expect(pill).toHaveAttribute("data-state", "saved");

    const editor = pmEditorLocator(page);
    await editor.click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(pill).toHaveAttribute("data-state", "saved");

    // Edit → dirty pill appears.
    await page.keyboard.press("End");
    await page.keyboard.type(` pill-flush-${Date.now()}`);
    await expect(pill).toHaveAttribute("data-state", "dirty", {
      timeout: 5_000,
    });

    // Manual flush via the pill. BUG-N55: the publisher gate compared raw
    // content === saved content, so the post-save refetch flipped it false and
    // the pill VANISHED on the very click that saved. It must stay, as "saved".
    await Promise.all([waitForAutosave(page), pill.click()]);
    await expect(pill).toHaveAttribute("data-state", "saved", {
      timeout: 10_000,
    });

    // …and survive the query refetch + further caret moves.
    await editor.click();
    await page.keyboard.press("ArrowLeft");
    await expect(pill).toHaveAttribute("data-state", "saved");
  });

  test.skip("[214] versions drawer opens for a narrative doc — pending Spec 06b integration", async () => {
    // The narrative editor does not yet render a Versions button. The
    // universal drawer (Spec 06b) is wired for screenplays only. Re-enable
    // this test when the drawer is plugged into NarrativeEditor's toolbar.
  });
});
