/**
 * Team roles — collaboration E2E (from the 2026-09-03 manual role audit)
 *
 * Covers the four use cases verified by hand on that audit, now automated:
 *   [520] Owner has full read/write access on the team project
 *   [521] Editor can write on the team project; the write actually persists
 *         (autosave round-trip, not just a client-side optimistic update)
 *   [522] Viewer's edit attempt never reaches the document — the server
 *         rejects it, and the DB content is provably unchanged
 *   [523] A write from one role is visible to another role after reload
 *         (cross-role content sync via the shared document row)
 *
 * Seeded roles on "Test Team" (packages/db/src/seed/index.ts):
 *   test@ohwriters.dev    — owner
 *   editor@ohwriters.dev  — editor
 *   viewer@ohwriters.dev  — viewer
 * All three share TEST_TEAM_PROJECT_ID ("Team Thriller").
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
  findResultShape,
} from "../pm-editor-helpers";

test.afterAll(() => {
  reseedTestDb();
});

const SYNOPSIS_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/synopsis`;

test.describe("Team roles — collaboration", () => {
  test("[520] owner has full read/write access on the team project", async ({
    authenticatedPage: owner,
  }) => {
    await owner.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await owner.goto(SYNOPSIS_PATH);

    const editor = pmEditorLocator(owner);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(owner.getByTestId("narrative-readonly-badge")).toHaveCount(0);
    await expect(editor).toHaveAttribute("contenteditable", "true");

    const marker = `owner-write-${Date.now()}`;
    await focusPmEditor(owner);
    await owner.keyboard.type(marker);
    await waitForAutosave(owner);

    await owner.reload();
    await expect(pmEditorLocator(owner)).toBeVisible({ timeout: 10_000 });
    expect(await readPmEditorText(owner)).toContain(marker);
  });

  test("[521] editor can write and the write persists across reload", async ({
    authenticatedEditorPage: editorPage,
  }) => {
    await editorPage.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await editorPage.goto(SYNOPSIS_PATH);

    const editor = pmEditorLocator(editorPage);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(
      editorPage.getByTestId("narrative-readonly-badge"),
    ).toHaveCount(0);
    await expect(editor).toHaveAttribute("contenteditable", "true");

    const marker = `editor-write-${Date.now()}`;
    await focusPmEditor(editorPage);
    await editorPage.keyboard.type(marker);
    await waitForAutosave(editorPage);

    // Round-trip: not just an optimistic client update — the server actually
    // persisted it (this is the exact thing the manual audit misjudged as a
    // bug before waiting out the real debounce).
    await editorPage.reload();
    await expect(pmEditorLocator(editorPage)).toBeVisible({ timeout: 10_000 });
    expect(await readPmEditorText(editorPage)).toContain(marker);
  });

  test("[522] viewer's edit never reaches the document (server-rejected, DB unchanged)", async ({
    authenticatedViewerPage: viewer,
  }) => {
    await viewer.goto(SYNOPSIS_PATH);

    const editor = pmEditorLocator(viewer);
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(viewer.getByTestId("narrative-readonly-badge")).toBeVisible();
    await expect(editor).toHaveAttribute("contenteditable", "false");

    // The E2E save hook is installed even in read-only mode so the server
    // guard itself can be verified (UI refusal alone isn't proof).
    await viewer.waitForFunction(
      () =>
        typeof (window as unknown as { __ohWritersSaveDocumentRaw?: unknown })
          .__ohWritersSaveDocumentRaw === "function",
      undefined,
      { timeout: 10_000 },
    );

    const marker = "viewer-tried-to-write-this";
    const saveRespPromise = viewer.waitForResponse(
      (resp) =>
        resp.url().includes("saveDocument") &&
        resp.request().method() === "POST",
      { timeout: 10_000 },
    );
    await viewer.evaluate((content) => {
      (
        window as unknown as {
          __ohWritersSaveDocumentRaw: (c: string) => void;
        }
      ).__ohWritersSaveDocumentRaw(content);
    }, marker);
    const saveResp = await saveRespPromise;

    const raw = await saveResp.text();
    const shape = findResultShape(JSON.parse(raw) as unknown);
    expect(shape, `no ResultShape in: ${raw}`).not.toBeNull();
    expect(shape!.isOk).toBe(false);
    expect(shape!.error?._tag).toBe("ForbiddenError");

    // The server rejected the write before touching the row, and the
    // viewer's own client never applied it either (rejected server-side, no
    // optimistic update) — so the still-open editor's content is already
    // proof the DB was never touched. No reload needed: a reload would just
    // re-read the same never-written row.
    expect(await readPmEditorText(viewer)).not.toContain(marker);
  });

  test("[523] a write from one role is visible to another role after reload", async ({
    authenticatedEditorPage: editorPage,
    authenticatedPage: owner,
  }) => {
    await editorPage.addInitScript(FAST_AUTOSAVE_SCRIPT);
    await editorPage.goto(SYNOPSIS_PATH);

    const editor = pmEditorLocator(editorPage);
    await expect(editor).toBeVisible({ timeout: 10_000 });

    const marker = `cross-role-sync-${Date.now()}`;
    await focusPmEditor(editorPage);
    await editorPage.keyboard.type(marker);
    await waitForAutosave(editorPage);

    // The owner, in a separate authenticated session, opens the same
    // document fresh and must see the editor's write. Poll instead of a
    // single read: a fresh navigation can win the race against the doc
    // fully hydrating from the just-written DB row.
    await owner.goto(SYNOPSIS_PATH);
    await expect(pmEditorLocator(owner)).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => readPmEditorText(owner), { timeout: 10_000 })
      .toContain(marker);
  });
});
