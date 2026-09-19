import { describe, it, expect } from "vitest";
import { pdfFirstPageItems } from "../../../../../../tests/helpers/pdf";
import { buildScreenplayPdf } from "./pdf-screenplay.js";
import { buildExportPipeline } from "./export-pipeline.js";
import { normalizeFountainForExport } from "./normalize-fountain.js";

/**
 * Regression: a real "Walkie Talkie" export showed every "(dal
 * walkie-talkie)" parenthetical printed flush with the dialogue column
 * instead of its own indent — the editor rendered it correctly (centred,
 * between the character cue and dialogue), only the export was wrong.
 *
 * Root cause: docToFountain writes parentheticals at CHARACTER_INDENT (6
 * spaces) so the editor's own fountainToDoc round-trip can classify them
 * back correctly — see doc-to-fountain.ts. But afterwriting's real parser
 * (aw-parser) matches a parenthetical with an EXACT regex, `/^(\(.+\))$/`,
 * which fails for an indented line ("      (foo)" — the `^` anchor requires
 * "(" as the very first character) and silently falls through to plain
 * "dialogue" classification, printing at the dialogue feed (further left)
 * instead of the parenthetical's own feed.
 *
 * Fixed by stripping the leading indent from parenthetical lines
 * (normalizeFountainForExport's uppercaseWysiwygElements → stripLeadingIndent)
 * — export-only, the stored document is untouched. Runs the exact pipeline
 * screenplay-export.server.ts drives and checks the actual rendered PDF's
 * per-item x-positions, the same level BUG-N63/#184's tests already use for
 * this renderer.
 */
describe("screenplay PDF export — parenthetical alignment", () => {
  it("prints a parenthetical between the character and dialogue columns, not flush with dialogue", async () => {
    const fountain = [
      "INT. ROOM - DAY",
      "",
      "ANNA (V.O.)",
      "(dal walkie-talkie)",
      "Flora, io e Teddy siamo sani e salvi.",
    ].join("\n");
    const normalized = normalizeFountainForExport(fountain);
    const pipeline = buildExportPipeline("standard", {
      fountain: normalized,
      includeCoverPage: false,
    });
    const buffer = await buildScreenplayPdf(pipeline.fountain, {
      invocation: pipeline.invocation,
    });
    const items = await pdfFirstPageItems(buffer);

    const character = items.find((it) => it.str.includes("ANNA"));
    const parenthetical = items.find((it) =>
      it.str.includes("dal walkie-talkie"),
    );
    const dialogue = items.find((it) => it.str.includes("Flora"));

    expect(character).toBeDefined();
    expect(parenthetical).toBeDefined();
    expect(dialogue).toBeDefined();

    // Standard screenplay format: parenthetical sits strictly between the
    // character cue and dialogue columns — never flush with either.
    expect(parenthetical!.x).toBeGreaterThan(dialogue!.x);
    expect(parenthetical!.x).toBeLessThan(character!.x);
  }, 30_000);
});
