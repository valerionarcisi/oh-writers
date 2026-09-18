import { fountainToDoc } from "./fountain-to-doc";
import { docToFountain } from "./doc-to-fountain";
import { detectElement } from "./fountain-element-detector";
import { CHARACTER_INDENT } from "./fountain-constants";

/**
 * Re-emit a Fountain string with canonical element indentation.
 *
 * Stored Fountain is not always well-formed: AI generation and PDF imports
 * can leave a character's speech aligned at the 6-space CHARACTER_INDENT
 * (under the cue) or flush-left, instead of the 10-space DIALOGUE_INDENT.
 * afterwriting's PDF renderer keys off those exact column positions, so a
 * mis-indented speech line is rendered as ACTION (flush left) rather than
 * DIALOGUE — the "dialogue exported as action" bug.
 *
 * `fountainToDoc` already classifies elements correctly using dialogue-block
 * context (cue → blank → indented speech stays dialogue), and `docToFountain`
 * always writes each element at its canonical indent. Round-tripping through
 * the editor's own parser/serializer therefore repairs the indentation while
 * preserving scene order, scene numbers, transitions, and parentheticals.
 *
 * Canonical writeup of the mixed-case/reversed-heading export regression
 * this function also fixes (referenced from fountain-element-detector.test.ts,
 * normalize-fountain.test.ts, and pdf-screenplay-scene-numbering.test.ts — see
 * those for the specific repro each covers): a real scene 1 heading typed
 * "EXT/Int. QUARTIERE..." (mixed case, reversed EXT/INT order) hit THREE
 * stacked bugs on export — (1) SCENE_HEADING_RE was case-sensitive, demoting
 * the heading to action before it ever reached afterwriting; (2) even fixed,
 * afterwriting's own parser only accepts the compound prefix as "int/ext",
 * never reversed; (3) independent of both, afterwriting's liner.js has an
 * upstream bug that drops scene 1's printed number in EVERY export,
 * regardless of casing (patched separately in awc-runner.cjs).
 * uppercaseWysiwygElements and normalizeSceneHeadingForAfterwriting below fix
 * (1)+(2); see awc-runner.cjs for (3).
 *
 * Pure function: no I/O, deterministic. Idempotent — normalizing already
 * canonical Fountain returns the same shape.
 */
export const normalizeFountainForExport = (fountain: string): string =>
  uppercaseWysiwygElements(docToFountain(fountainToDoc(fountain)));

/**
 * Scene headings, character cues, and transitions all render UPPERCASE in
 * the editor via CSS (`text-transform: uppercase` — see prosemirror.module.css),
 * but the stored Fountain text keeps whatever case the writer actually typed
 * ("PAdre", "EXT/Int. ..."). afterwriting (the PDF renderer) has no such CSS
 * layer and prints the raw text verbatim, so a mixed-case heading/cue that
 * looked fine on screen came out wrong (or, worse, unrecognised as a scene
 * heading at all — afterwriting's own parser also requires uppercase
 * INT/EXT/EST) in the exported PDF. Uppercasing these three element types
 * at export time is what makes the PDF WYSIWYG with what the editor already
 * shows — the stored document itself is untouched (docToFountain elsewhere
 * still round-trips verbatim; this only runs in the export path).
 */
const uppercaseWysiwygElements = (fountain: string): string => {
  const lines = fountain.split("\n");
  let prev: string | null = null;
  const out = lines.map((line) => {
    const type = detectElement(line, prev);
    prev = line;
    if (type === "scene") return normalizeSceneHeadingForAfterwriting(line);
    if (type === "transition") return line.toUpperCase();
    if (type === "character") {
      return line.startsWith(CHARACTER_INDENT)
        ? CHARACTER_INDENT + line.slice(CHARACTER_INDENT.length).toUpperCase()
        : line.toUpperCase();
    }
    return line;
  });
  return out.join("\n");
};

// afterwriting's OWN fountain grammar (aw-parser's `scene_heading` regex,
// node_modules/aw-parser/parser.js) recognises the compound "int/ext" prefix
// in that order ONLY — a heading written "EXT/INT." or "EST/INT." (our own
// SCENE_HEADING_RE deliberately accepts either order, matching how writers
// actually type headings) fails afterwriting's parser entirely and silently
// renders as unnumbered, unbolded plain text, even after uppercasing. This
// swaps a reversed compound prefix into the order afterwriting requires —
// export-only, the stored document keeps whatever order the writer typed.
const REVERSED_COMPOUND_RE = /^(EXT|EST)(\.?\/)(INT)(\.?)(\s|$)/;
const normalizeSceneHeadingForAfterwriting = (line: string): string => {
  const upper = line.toUpperCase();
  return upper.replace(
    REVERSED_COMPOUND_RE,
    (_m, _ext, _slash, int, dot, ws) => `${int}/EXT${dot}${ws}`,
  );
};
