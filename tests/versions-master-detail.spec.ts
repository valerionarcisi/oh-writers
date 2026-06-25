// tests/versions-master-detail.spec.ts
//
// [OHW-066] Versions surface — master→detail (Spec 66 / ADR-0004).
//
// The Versions surface is master→detail, no diff: a list of versions, click one
// to read its full content read-only, with Attiva / Indietro + per-version
// actions (rename · duplicate · draft-colour dot) from BOTH the list and the
// open detail. The TopBar [● Versioni] chip opens it. There is NO segmented
// "Attuale/Confronta" control and NO side-by-side diff table.
//
// The seed ships a single soggetto version; tests add a second through the
// document `createVersionFromScratch` server fn (the deterministic, URL-stable
// way to add a version in-test) before asserting list/detail/activate.
import { test, expect, TEST_TEAM_PROJECT_ID } from "./fixtures";
import { BASE_URL } from "./fixtures";
import type { Page } from "@playwright/test";

const SOGGETTO_PATH = `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/soggetto`;

// Open the routed Versions surface via the TopBar version chip (Spec 66 phase 6)
// and return the document id the chip routed to.
const openVersionsViaChip = async (page: Page): Promise<string> => {
  // The chip publishes into the TopBar after the narrative shell mounts, so wait
  // for the page before reaching for it.
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 15_000,
  });
  const chip = page.getByTestId("topbar-version-chip");
  await expect(chip).toBeVisible({ timeout: 15_000 });
  // Retry the click if the lane hasn't mounted yet: the chip routes to
  // `?versions=`, and the lane (a routed grid column) can lag a beat behind the
  // navigation after a reload.
  await expect(async () => {
    await chip.click();
    await expect(page.getByTestId("versions-split-drawer")).toBeVisible({
      timeout: 4_000,
    });
  }).toPass({ timeout: 20_000 });
  return page.evaluate(
    () => new URL(location.href).searchParams.get("versions") ?? "",
  );
};

// Add a fresh version via the document server fn; returns the new version id.
const createBlankVersion = async (
  page: Page,
  documentId: string,
): Promise<string> => {
  const url =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--createVersionFromScratch_createServerFn_handler?createServerFn`;
  const res = await page.request.post(url, {
    headers: { "Content-Type": "application/json" },
    data: { data: { documentId } },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    result?: { value?: { id?: string } };
  };
  const id = body.result?.value?.id;
  expect(id, "createVersionFromScratch returns the new id").toBeTruthy();
  return id as string;
};

test.describe("[OHW-066] Versions master→detail", () => {
  test("chip opens the surface; list shows colour dots + current badge; NO diff/segmented", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const docId = await openVersionsViaChip(page);
    await createBlankVersion(page, docId);
    await page.reload();
    await openVersionsViaChip(page);

    // List renders with at least two rows, each with a colour dot.
    const rows = page.locator('[data-testid^="versions-split-row-"]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
    await expect(
      page.locator('[data-testid^="version-dot-"]').first(),
    ).toBeVisible();
    // Exactly one "current" badge.
    await expect(
      page.locator('[data-testid^="versions-split-current-"]'),
    ).toHaveCount(1);

    // [A3] The active version's ROW is distinct at a glance: exactly one row
    // carries the data-current marker, and that same row hosts the "● Attuale"
    // badge in the LIST itself (not just the detail pane).
    const currentRows = page.locator(
      '[data-testid^="versions-split-row-"][data-current="true"]',
    );
    await expect(currentRows).toHaveCount(1);
    await expect(currentRows.first()).toContainText("Attuale");
    // The marker carries a tinted (non-transparent) background, so it reads as
    // highlighted versus the plain rows.
    const currentBg = await currentRows
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(currentBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(currentBg).not.toBe("transparent");

    // The "+ Nuova versione" affordance is present.
    await expect(page.getByTestId("version-new")).toBeVisible();

    // Regression (ADR-0004): no segmented control, no diff table.
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await expect(page.getByTestId("versions-split-diff")).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        new URL(location.href).searchParams.has("compare"),
      ),
    ).toBe(false);
  });

  test("click a version → read-only detail with content + Indietro returns to list", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const docId = await openVersionsViaChip(page);
    await createBlankVersion(page, docId);
    await page.reload();
    await openVersionsViaChip(page);

    // Open the detail of the FIRST row (newest). Whatever its content, the
    // master→detail panes must render: a read-only content node + a back button.
    await page.locator('[data-testid^="versions-split-row-"]').first().click();

    const detail = page.getByTestId("versions-split-detail");
    await expect(detail).toBeVisible();
    await expect(page.getByTestId("versions-split-content")).toBeVisible();

    // Indietro returns to the list.
    await page.getByTestId("versions-split-back").click();
    await expect(page.getByTestId("versions-split-list")).toBeVisible();
  });

  test("Attiva switches the active version (current badge moves)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const docId = await openVersionsViaChip(page);
    await createBlankVersion(page, docId);
    await page.reload();
    await openVersionsViaChip(page);

    // A non-current version exposes an Attiva button; the current one does not.
    // Capture the id of the row we activate, then click it.
    const activate = page.locator('[data-testid^="version-activate-"]').first();
    await expect(activate).toBeVisible();
    const activateTestId = await activate.getAttribute("data-testid");
    const targetId = activateTestId!.replace("version-activate-", "");

    // The current badge starts on some OTHER row (not the target).
    await expect(
      page.getByTestId(`versions-split-current-${targetId}`),
    ).toHaveCount(0);

    // Click the activate button directly (the row button is a click target too,
    // so target the activate testid explicitly to avoid the row swallowing it).
    await page.getByTestId(`version-activate-${targetId}`).click();

    // [A4] Visible confirmation: a success toast announces the activation, so
    // the writer is never left guessing whether it worked.
    await expect(page.getByText("Versione attivata")).toBeVisible({
      timeout: 10_000,
    });

    // [A4] After activation the "Attuale" marker MOVES to the target row — it now
    // carries the current badge and exactly one version is current. The list
    // refetches the live current-version pointer, so poll.
    await expect(
      page.getByTestId(`versions-split-current-${targetId}`),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('[data-testid^="versions-split-current-"]'),
    ).toHaveCount(1);
    // The moved marker lives on the same row that was activated (data-current).
    await expect(
      page.locator(
        `[data-testid="versions-split-row-${targetId}"][data-current="true"]`,
      ),
    ).toHaveCount(1);
  });

  test("set a draft colour → the version's dot reflects it", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const docId = await openVersionsViaChip(page);
    await createBlankVersion(page, docId);
    await page.reload();
    await openVersionsViaChip(page);

    const firstRow = page
      .locator('[data-testid^="versions-split-row-"]')
      .first();
    const rowTestId = await firstRow.getAttribute("data-testid");
    const vId = rowTestId!.replace("versions-split-row-", "");

    await page.getByTestId(`version-color-trigger-${vId}`).click();
    await page.getByTestId(`version-color-${vId}-blue`).click();

    // The dot's background becomes the blue draft colour (a8c8ff).
    await expect
      .poll(
        async () =>
          page.evaluate((id) => {
            const dot = document.querySelector(
              `[data-testid="version-dot-${id}"]`,
            );
            return dot ? getComputedStyle(dot).backgroundColor : "";
          }, vId),
        { timeout: 8_000 },
      )
      .toBe("rgb(168, 200, 255)");
  });

  // Ported from the retired documents/versioning.spec (old narrative drawer):
  // duplicate + rename now live on the routed master→detail surface.
  test("duplicate creates a new version (row count grows)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(SOGGETTO_PATH);
    const docId = await openVersionsViaChip(page);
    await createBlankVersion(page, docId);
    await page.reload();
    await openVersionsViaChip(page);

    const rows = page.locator('[data-testid^="versions-split-row-"]');
    const before = await rows.count();
    const firstId = (await rows.first().getAttribute("data-testid"))!.replace(
      "versions-split-row-",
      "",
    );
    await page.getByTestId(`version-duplicate-${firstId}`).click();
    await expect
      .poll(async () => rows.count(), { timeout: 8_000 })
      .toBe(before + 1);
  });

  test("inline rename persists", async ({ authenticatedPage: page }) => {
    await page.goto(SOGGETTO_PATH);
    await openVersionsViaChip(page);

    // Rename the seed's single version in place. (Creating an extra version
    // first introduces a list refetch/reorder race against the captured row id,
    // so rename the row that's already there.)
    const firstId = (await page
      .locator('[data-testid^="versions-split-row-"]')
      .first()
      .getAttribute("data-testid"))!.replace("versions-split-row-", "");

    await page.getByTestId(`version-rename-${firstId}`).click();
    const label = `bozza-${Date.now()}`;
    const input = page.getByTestId(`version-rename-input-${firstId}`);
    await input.fill(label);
    await input.press("Enter");

    // The renamed row reflects the new label.
    await expect(
      page.getByTestId(`versions-split-row-${firstId}`),
    ).toContainText(label, { timeout: 8_000 });
  });

  test("sad path: a malformed ?versions is ignored (fail closed, no drawer)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${SOGGETTO_PATH}?versions=not-a-uuid`);
    await expect(page.getByTestId("soggetto-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("versions-split-lane")).toHaveCount(0);
  });
});
