/**
 * Spec 06 — Versioning
 *
 * Browser E2E tests. Require the dev server running with MOCK_API=true:
 *   MOCK_API=true pnpm dev
 *
 * Run tests:
 *   pnpm test tests/versioning/
 *
 * [OHW-061] Manual version creation appears in list with label
 * [OHW-062] Version detail renders read-only content with Restore button
 * [OHW-063] Diff page shows additions in green, deletions in red
 * [OHW-064] Restore navigates back to editor
 * [OHW-065] Cannot delete the only manual version
 */

import { test, expect } from "@playwright/test";

const BASE = process.env["BASE_URL"] ?? "http://localhost:3002";

const PROJECT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const SCREENPLAY_URL = `${BASE}/projects/${PROJECT_ID}/screenplay`;
const VERSIONS_URL = `${SCREENPLAY_URL}/versions`;

// Known mock version IDs from projects.data.ts
const MANUAL_VERSION_ID = "vvvvvvvv-0000-0000-0000-000000000001";
const VERSION_DETAIL_URL = `${VERSIONS_URL}/${MANUAL_VERSION_ID}`;
const DIFF_URL = `${SCREENPLAY_URL}/diff/${MANUAL_VERSION_ID}/current`;

// ─── [OHW-061] Manual version creation ───────────────────────────────────────

test("[OHW-061] manual version creation appears in list with label", async ({
  page,
}) => {
  await page.goto(VERSIONS_URL);

  // Wait for the versions list to load
  await expect(page.getByText("Manual Versions")).toBeVisible({
    timeout: 10_000,
  });

  // The pre-seeded manual version "Draft 1" should be in the list
  await expect(page.getByText("Draft 1")).toBeVisible();

  // Open the create form
  await page.getByRole("button", { name: "+ Save Version" }).click();

  // Fill in the label
  const label = `Test Version ${Date.now()}`;
  const input = page.getByPlaceholder("Version label (e.g. Draft 1)");
  await expect(input).toBeVisible();
  await input.fill(label);

  // Save
  await page.getByRole("button", { name: "Save" }).click();

  // New version should appear in the list
  await expect(page.getByText(label)).toBeVisible({ timeout: 5_000 });
});

// ─── [OHW-062] Version detail viewer ────────────────────────────────────────

test("[OHW-062] version detail renders read-only content with Restore button", async ({
  page,
}) => {
  await page.goto(VERSION_DETAIL_URL);

  // The read-only banner should be present
  await expect(page.getByText("Read-only")).toBeVisible({ timeout: 10_000 });

  // The Restore button should be visible
  await expect(
    page.getByRole("button", { name: "Restore this version" }),
  ).toBeVisible();

  // The "Diff vs current" link should be present
  await expect(page.getByText("Diff vs current")).toBeVisible();

  // Monaco editor should load in read-only mode
  const editorContainer = page.locator(".monaco-editor").first();
  await expect(editorContainer).toBeVisible({ timeout: 15_000 });
});

// ─── [OHW-063] Diff page — colored lines ─────────────────────────────────────

test("[OHW-063] diff page shows additions in green, deletions in red", async ({
  page,
}) => {
  await page.goto(DIFF_URL);

  // Wait for the diff page to load
  await expect(page.locator('[data-testid="diff-stats"]')).toBeVisible({
    timeout: 10_000,
  });

  // The diff area should contain both columns
  await expect(page.locator('[data-testid="diff-old"]')).toBeVisible();
  await expect(page.locator('[data-testid="diff-new"]')).toBeVisible();

  // Stats should show added/removed counts
  await expect(page.getByText(/\+\d+ added/)).toBeVisible();
  await expect(page.getByText(/−\d+ removed/)).toBeVisible();

  // Green (insert) lines should exist in the new column
  const insertLines = page.locator(
    '[data-testid="diff-new"] [class*="lineInsert"]',
  );
  await expect(insertLines.first()).toBeVisible();
});

// ─── [OHW-064] Restore navigates back to editor ───────────────────────────────

test("[OHW-064] restore navigates back to editor", async ({ page }) => {
  await page.goto(VERSION_DETAIL_URL);

  // Wait for the page to load
  await expect(
    page.getByRole("button", { name: "Restore this version" }),
  ).toBeVisible({
    timeout: 10_000,
  });

  // Click restore
  await page.getByRole("button", { name: "Restore this version" }).click();

  // Should navigate back to the screenplay editor
  await expect(page).toHaveURL(`${BASE}/projects/${PROJECT_ID}/screenplay`, {
    timeout: 10_000,
  });
});

// ─── [OHW-065] Cannot delete only manual version ──────────────────────────────

test("[OHW-065] cannot delete the only manual version", async ({ page }) => {
  await page.goto(VERSIONS_URL);

  // Wait for the list to load
  await expect(page.getByText("Manual Versions")).toBeVisible({
    timeout: 10_000,
  });

  // The pre-seeded mock data has exactly ONE manual version ("Draft 1")
  // Attempt to delete it — the server should reject with CannotDeleteLastManualError
  const deleteBtn = page.locator(
    `[data-testid="delete-version-${MANUAL_VERSION_ID}"]`,
  );
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  // An error message should appear
  await expect(
    page.getByText("Cannot delete the only manual version"),
  ).toBeVisible({
    timeout: 5_000,
  });

  // The version should still be in the list
  await expect(page.getByText("Draft 1")).toBeVisible();
});
