import { fountainToDoc } from "./fountain-to-doc";
import { docToFountain } from "./doc-to-fountain";

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
 * Pure function: no I/O, deterministic. Idempotent — normalizing already
 * canonical Fountain returns the same shape.
 */
export const normalizeFountainForExport = (fountain: string): string =>
  docToFountain(fountainToDoc(fountain));
