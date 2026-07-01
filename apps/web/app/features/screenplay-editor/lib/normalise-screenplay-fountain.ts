import { splitInlineCues } from "./split-inline-cues";
import { fountainToDoc } from "./fountain-to-doc";
import { docToFountain } from "./doc-to-fountain";

// The ONE mandatory gate for every model-produced screenplay text (generate,
// revise, scene rewrite, find/replace). The model is unreliable at Fountain
// element formatting (#46/#51/#53): it collides a cue with its speech on one
// physical line, stacks cues with no blank separators, and collides two cues on
// a line. Repairing that needs more than a line-split — a cue only parses when
// it is on its OWN line AND properly indented; a flat "FILIPPO" line is folded
// back into the following dialogue by any reflow pass.
//
// So we split inline cues, parse to a real PM doc, and re-serialise. The
// parse→serialise round-trip is what makes the cues structural (indented) and
// idempotent: whatever spacing the model emitted, the output is canonical
// Fountain the editor types correctly. Falls back to the cue-split raw text if
// the round-trip somehow yields nothing (never returns empty for non-empty in).
export const normaliseScreenplayFountain = (raw: string): string => {
  const split = splitInlineCues(raw);
  const canonical = docToFountain(fountainToDoc(split)).trim();
  return canonical.length > 0 ? canonical : split;
};
