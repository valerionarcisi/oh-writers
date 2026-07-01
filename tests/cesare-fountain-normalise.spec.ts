import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import {
  openCesareSheet,
  resetScreenplayState,
  sendCesareMessage,
  waitForCesareReply,
} from "./helpers/cesare";

/**
 * [#51 / #53] Cesare must produce correct Fountain on the scene-EDIT path.
 *
 * The model is unreliable at Fountain cue formatting — it emits "CUE speech" on
 * one physical line, and sometimes collides two cues on a line. The server-side
 * splitInlineCues gate normalises every model→screenplay seam at its source, so
 * the accepted scene parses to real DIALOGUE (cue + speech on separate lines),
 * never a wall of action.
 *
 * The mock returns deliberately broken Fountain for "riscrivi la scena con
 * dialoghi rotti"; after ✓ accept the canonical Fountain must show the cues on
 * their own lines and no surviving "CUE speech" one-liner.
 */
test.describe("[#51] Cesare Fountain normalisation on scene edit", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetScreenplayState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("accepting a broken-dialogue rewrite yields well-formed cues (no 'CUE speech' one-liners)", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${BASE_URL}/projects/${TEAM_PROJECT_ID}/screenplay`,
    );
    await authenticatedPage.waitForLoadState("networkidle");

    await expect(authenticatedPage.getByTestId("prosemirror-view")).toBeVisible(
      { timeout: 20_000 },
    );

    await openCesareSheet(authenticatedPage);
    await sendCesareMessage(
      authenticatedPage,
      "Riscrivi la scena con dialoghi rotti.",
    );
    await waitForCesareReply(authenticatedPage);

    const acceptBtn = authenticatedPage.getByTestId("cesare-pending-accept");
    await expect(acceptBtn).toBeVisible({ timeout: 20_000 });
    await acceptBtn.click();

    await expect(
      authenticatedPage.locator("[data-testid='cesare-pending-edit']"),
    ).toBeHidden({ timeout: 5_000 });

    const fountain: string = await authenticatedPage.evaluate(
      () =>
        (
          window as unknown as { __ohWritersFountain?: () => string }
        ).__ohWritersFountain?.() ?? "",
    );

    // The cue and its speech land on separate lines.
    expect(fountain).toMatch(/FILIPPO\s*\n\s*Comici\. Open mic\./);
    // The two-cue collision ("FILIPPO Giulio — GIULIO Vai.") is fully split.
    expect(fountain).toMatch(
      /FILIPPO\s*\n\s*Giulio\s*\n\s*GIULIO\s*\n\s*Vai\./,
    );

    // No "CUE speech" one-liner survives anywhere (ALL-CAPS cue immediately
    // followed by lowercase-bearing speech on the same line).
    for (const line of fountain.split("\n")) {
      const t = line.trim();
      if (t.startsWith("INT.") || t.startsWith("EXT.")) continue;
      expect(t).not.toMatch(/^[A-ZÀ-Ý][A-ZÀ-Ý ]+\s+\p{Ll}/u);
    }
  });
});
