import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { navigateToBreakdown, TEAM_PROJECT_ID } from "./helpers";

/**
 * [Spec 10e] Auto-spoglio — bilingual coverage
 *
 * Two complementary checks:
 *
 *   1. IT — verifies the new `extractProps` (microfono / vassoio /
 *      bottiglia / …) emits ghost tags on the seeded "Bloody knife"
 *      scene which contains "Una bottiglia di vino rotta". Pre-this
 *      extractor, props were left to Cesare on-demand.
 *
 *   2. EN — extractors that are language-agnostic (cast CAPS cues,
 *      INT./EXT. sluglines, V.O. marker) are exercised at the unit
 *      level by `extract-all.test.ts > English screenplay coverage`.
 *      A full browser-level EN spoglio test requires seeding an English
 *      project; tracked as TODO below until the seed lands.
 *
 *   3. Cast — verifies the FADE OUT./THE END./CUT TO: transition
 *      filter does not leak transition tokens into the cast list. The
 *      previous extractor mis-categorised "FADE OUT." as a character.
 */
test.describe("[Spec 10e] Auto-spoglio — bilingual", () => {
  test("[OHW-323] IT new props extractor adds 'Bottiglia' ghost on scene 1 of team project", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Scene-1 notes contain "Una bottiglia di vino rotta accanto." — the
    // new IT props lemma list (display "Bottiglia", stem "bottigli\\w*")
    // emits this as a pending ghost on auto-spoglio. Scene 1 is the
    // default active scene on mount.
    await expect(page.getByTestId("ghost-tag-Bottiglia").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("[OHW-324] cast extractor does not emit FADE OUT./THE END. as characters", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await navigateToBreakdown(page, TEAM_PROJECT_ID);

    // Wait for auto-spoglio to land on scene 1 so any false-positive
    // would already be in the panel.
    await expect(
      page.getByTestId("accepted-tag-Appartamento").first(),
    ).toBeVisible({ timeout: 15_000 });

    // No element named after a transition keyword may ever appear as a
    // tag. We assert by data-testid rather than visible text so a future
    // localisation cannot mask a regression.
    for (const token of ["FADE OUT.", "THE END.", "CUT TO:", "DISSOLVENZA."]) {
      await expect(page.getByTestId(`accepted-tag-${token}`)).toHaveCount(0);
      await expect(page.getByTestId(`ghost-tag-${token}`)).toHaveCount(0);
    }
  });

  test.skip("[OHW-325] EN — cast/locations/V.O. extracted from English screenplay", () => {
    // Pending: seed an English fixture project (clean-short.fountain,
    // ~75 lines, "THE LAST KEY"). When that lands:
    //   await navigateToBreakdown(page, EN_PROJECT_ID);
    //   await openSceneInBreakdown(page, 3);
    //   await expect(page.getByTestId("accepted-tag-Elena")).toBeVisible();
    //   await expect(page.getByTestId("ghost-tag-Voice Over")).toBeVisible();
    // Until then the extractor is exercised at unit level by
    //   packages/domain/src/breakdown/extractors/extract-all.test.ts
    //   > "English screenplay coverage".
  });
});
