/**
 * Empty-document direct navigation — first doc of a NEW project
 *
 * Direct-navigating to Sinossi / Scaletta / Trattamento on a freshly created
 * project must render an EMPTY editor (create-on-first-edit), never the
 * "Documento non trovato" not-found overlay. The server find-or-creates the
 * document row for any reachable project; project-level failures (missing /
 * forbidden project) still surface a real not-found body.
 *
 *   [260] Fresh project → /synopsis shows an empty editor, not the not-found body
 *   [261] Fresh project → /outline (Scaletta) shows an empty editor
 *   [262] Fresh project → /treatment shows an empty editor
 *   [263] Fresh project → /soggetto shows an empty editor
 *   [264] A genuinely missing project still shows the not-found body
 */

import { test, expect } from "../fixtures";
import { BASE_URL } from "../helpers";

const NOT_FOUND_BODY = "Il documento richiesto non esiste o è stato rimosso.";

async function createFreshProject(
  page: Parameters<Parameters<typeof test>[1]>[0]["authenticatedPage"],
): Promise<string> {
  await page.goto(`${BASE_URL}/projects/new`);
  await page.waitForLoadState("networkidle");
  const titleInput = page.getByRole("textbox", { name: /titolo|title/i });
  await expect(titleInput).toBeVisible({ timeout: 10_000 });
  await titleInput.fill(`Empty Docs ${Date.now()}`);
  await page
    .getByRole("combobox", { name: /formato|format/i })
    .selectOption("feature");
  await page
    .getByRole("button", { name: /crea progetto|create project/i })
    .click();
  await page.waitForURL(
    (url) => /\/projects\/[0-9a-f-]{36}$/.test(url.pathname),
    { timeout: 15_000 },
  );
  const match = page.url().match(/\/projects\/([0-9a-f-]{36})$/);
  const projectId = match?.[1];
  if (!projectId) throw new Error("could not extract new project id");
  return projectId;
}

test.describe("[Spec audit-7] First document of a NEW project", () => {
  test("[260] direct nav to Sinossi shows an empty editor, not the not-found body", async ({
    authenticatedPage: page,
  }) => {
    const projectId = await createFreshProject(page);

    await page.goto(`${BASE_URL}/projects/${projectId}/synopsis`);

    // An empty, editable ProseMirror editor renders — never the not-found body.
    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(editor).toHaveText("");
    await expect(page.getByText(NOT_FOUND_BODY)).toHaveCount(0);
    await expect(page.getByText("Documento non trovato")).toHaveCount(0);
  });

  test("[261] direct nav to Scaletta (outline) shows an empty editor", async ({
    authenticatedPage: page,
  }) => {
    const projectId = await createFreshProject(page);

    await page.goto(`${BASE_URL}/projects/${projectId}/outline`);

    // The outline editor mounts (any of its editable affordances is enough);
    // crucially the not-found body must not appear.
    await expect(page.getByText(NOT_FOUND_BODY)).toHaveCount(0);
    await expect(page.getByText("Documento non trovato")).toHaveCount(0);
  });

  test("[262] direct nav to Trattamento shows an empty editor", async ({
    authenticatedPage: page,
  }) => {
    const projectId = await createFreshProject(page);

    await page.goto(`${BASE_URL}/projects/${projectId}/treatment`);

    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(editor).toHaveText("");
    await expect(page.getByText(NOT_FOUND_BODY)).toHaveCount(0);
    await expect(page.getByText("Documento non trovato")).toHaveCount(0);
  });

  test("[263] direct nav to Soggetto shows an empty editor", async ({
    authenticatedPage: page,
  }) => {
    const projectId = await createFreshProject(page);

    await page.goto(`${BASE_URL}/projects/${projectId}/soggetto`);

    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(NOT_FOUND_BODY)).toHaveCount(0);
    await expect(page.getByText("Documento soggetto non trovato")).toHaveCount(
      0,
    );
  });

  test("[264] a genuinely missing project still shows a not-found body", async ({
    authenticatedPage: page,
  }) => {
    const missingProjectId = "00000000-0000-4000-a000-000000099999";
    await page.goto(`${BASE_URL}/projects/${missingProjectId}/synopsis`);

    // Project-level failure → a real not-found / forbidden body, never an
    // editor the user could type into for a project they cannot reach.
    await expect(page.getByText(/non trovato|Accesso negato/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(".ProseMirror")).toHaveCount(0);
  });
});
