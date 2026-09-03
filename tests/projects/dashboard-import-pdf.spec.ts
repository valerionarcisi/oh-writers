/**
 * Dashboard "Importa PDF" — create-project-from-PDF round trip.
 *
 * Regression coverage for a bug found live 2026-09-03: the imported
 * screenplay landed on the fresh project's editor as a BLANK page (and no
 * title) even though the server correctly parsed and saved the PDF's
 * content. Root cause was a stale TanStack Query cache entry — the hook
 * fetched the empty screenplay row before saving the imported text into it,
 * then navigated without waiting for the invalidated query to refetch, so
 * ScreenplayEditor mounted from the pre-save (empty) cache entry and its own
 * autosave persisted that empty state right over the imported content.
 *
 * Distinct from tests/editor/pdf-import-titlepage.spec.ts, which covers the
 * SAME title-page pipeline but importing into an *existing* project's
 * editor (Altre azioni → Importa PDF) — this spec is the dashboard's
 * create-project-from-PDF entry point, a different code path
 * (useCreateProjectFromScreenplay) that this bug was specific to.
 */
import path from "path";
import { test, expect } from "../fixtures";
import { BASE_URL, getEditorContent } from "../helpers";

const FIXTURE = (name: string) =>
  path.resolve(__dirname, "../fixtures/screenplays", name);

const WITH_TITLE_PAGE_PDF = FIXTURE("with-title-page.pdf");

test("[dashboard PDF import] importing a PDF creates a titled project with real content, not a blank editor", async ({
  authenticatedPage: page,
}) => {
  await page.goto(`${BASE_URL}/dashboard`);
  await expect(page.getByTestId("dashboard-import-pdf")).toBeVisible({
    timeout: 15_000,
  });

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("dashboard-import-pdf").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(WITH_TITLE_PAGE_PDF);

  // Navigates to the fresh project's screenplay editor once the import +
  // save round trip completes.
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/screenplay/, {
    timeout: 30_000,
  });

  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });

  // The regression: the page rendered visually empty (no scene headings, no
  // text) even though the DB had the right content — so assert both the
  // DOM and the editor's own fountain serialisation are non-empty.
  await expect(editor).not.toBeEmpty();
  await expect
    .poll(() => getEditorContent(page), { timeout: 15_000 })
    .not.toBe("");

  const fountain = await getEditorContent(page);
  expect(fountain.length).toBeGreaterThan(50);
});
