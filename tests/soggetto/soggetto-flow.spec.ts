import { expect } from "@playwright/test";
import { test } from "../fixtures";
import {
  navigateToSoggetto,
  navigateToProjectDashboard,
  TEAM_PROJECT_ID,
} from "./helpers";

/**
 * Spec 04f — Soggetto (Phase 10 E2E)
 *
 * Covers:
 *   [OHW-SOG-001] Page renders: logline block + subject editor + 5 section
 *                 headings + Soggetto card reachable from the project dashboard.
 *   [OHW-SOG-002] Generate button on "Premise" inserts Cesare-mocked body
 *                 below the heading.
 *   [OHW-SOG-003] Typing past ~3,600 words triggers the soft-limit banner in
 *                 SubjectFooter; the warning is dismissible and non-blocking.
 *
 * Requires the dev server to run with MOCK_AI=true so that the generate
 * mutation resolves deterministically without calling Anthropic.
 *
 * The UI currently renders the editor defaults in English (Premise,
 * Protagonist & antagonist, Narrative arc, World, Ending). The Italian
 * labels ship via i18n labels prop — tests assert on whichever set is
 * actually rendered by the SubjectEditor today.
 */

const SECTION_HEADINGS = [
  "Premise",
  "Protagonist & antagonist",
  "Narrative arc",
  "World",
  "Ending",
] as const;

test.describe("[Spec 04f] Soggetto — page flow", () => {
  test("[OHW-SOG-001] renders logline + editor with 5 headings and is reachable from the dashboard", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    await expect(page.getByTestId("logline-block")).toBeVisible();
    await expect(page.getByTestId("logline-textarea")).toBeVisible();
    await expect(page.getByTestId("subject-editor")).toBeVisible();
    await expect(page.getByTestId("subject-footer")).toBeVisible();

    const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 10_000 });

    for (const heading of SECTION_HEADINGS) {
      await expect(
        editor.getByRole("heading", { level: 2, name: heading }),
      ).toBeVisible();
    }

    await expect(page.getByTestId("soggetto-export")).toBeVisible();
    await expect(page.getByTestId("soggetto-export-siae")).toBeVisible();

    await navigateToProjectDashboard(page, TEAM_PROJECT_ID);
    const soggettoCard = page.getByText("Soggetto", { exact: true }).first();
    await expect(soggettoCard).toBeVisible({ timeout: 10_000 });
    await soggettoCard.click();
    await page.waitForURL(/\/projects\/.+\/soggetto$/, { timeout: 10_000 });
    await expect(page.getByTestId("soggetto-page")).toBeVisible();
  });

  test("[OHW-SOG-002] Generate on Premise inserts mock AI body below the heading", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    const generatePremise = page.getByTestId("subject-generate-premise");
    await expect(generatePremise).toBeVisible({ timeout: 10_000 });

    // If the Premise section already has content the component prompts
    // for confirmation via window.confirm — auto-accept.
    page.on("dialog", (dialog) => {
      void dialog.accept();
    });

    await generatePremise.click();

    const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
    const premiseHeading = editor.getByRole("heading", {
      level: 2,
      name: "Premise",
    });
    await expect(premiseHeading).toBeVisible();

    // Wait until the Premise heading is followed by a non-empty paragraph.
    // insertSectionBody puts the generated text immediately after the heading.
    await expect
      .poll(
        async () => {
          return editor.evaluate((root) => {
            const headings = Array.from(
              root.querySelectorAll("h2"),
            ) as HTMLElement[];
            const premise = headings.find(
              (h) => h.textContent?.trim() === "Premise",
            );
            if (!premise) return 0;
            let sibling = premise.nextElementSibling;
            let chars = 0;
            while (sibling && sibling.tagName !== "H2") {
              chars += (sibling.textContent ?? "").trim().length;
              sibling = sibling.nextElementSibling;
            }
            return chars;
          });
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  });

  test("[OHW-SOG-003] typing past the soft limit shows a dismissible warning banner", async ({
    authenticatedPage: page,
  }) => {
    await navigateToSoggetto(page, TEAM_PROJECT_ID);

    const editor = page.getByTestId("subject-editor").locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Inject > 3,600 words of prose directly into the ProseMirror doc via the
    // public onChange path. The exposed test hook isn't wired here, so we
    // paste into the contenteditable instead.
    const manyWords = `${"parola ".repeat(4000)}`.trim();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(manyWords.slice(0, 200));
    // Bulk-insert the remainder via clipboard to keep the test fast.
    await page.evaluate((text) => {
      const el = document.querySelector(
        '[data-testid="subject-editor"] .ProseMirror',
      ) as HTMLElement | null;
      if (!el) return;
      el.focus();
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, manyWords);

    const footer = page.getByTestId("subject-footer");
    await expect(footer).toBeVisible();

    const banner = footer
      .getByRole("status")
      .or(footer.locator('[role="alert"]'));
    // The Banner component exposes a dismiss button; we locate by the
    // SubjectFooter section to avoid false positives from other banners.
    const dismiss = footer.getByRole("button");
    await expect(dismiss.first()).toBeVisible({ timeout: 10_000 });

    await dismiss.first().click();
    await expect(dismiss.first()).toBeHidden();
    await expect(banner).toHaveCount(0);
  });
});
