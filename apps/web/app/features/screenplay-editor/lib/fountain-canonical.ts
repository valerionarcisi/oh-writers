/**
 * Canonical Fountain = what the editor shows. Stored content may be
 * non-canonical (Cesare writes raw AI fountain, PDF import strips indents,
 * older saves) — the editor heals it on load via fountainToDoc, so any
 * consumer that bypasses the editor (PDF export, dirty-check) must apply
 * the same lens or it diverges from what the writer sees (BUG-N63: speech
 * stored at the cue indent rendered as character/action in the PDF while
 * the editor showed a proper dialogue block).
 *
 * Idempotent: canonicalize(canonicalize(s)) === canonicalize(s) — pinned by
 * fountain-canonical-dirty.test.ts.
 */
import { fountainToDoc } from "./fountain-to-doc";
import { docToFountain } from "./doc-to-fountain";

export const canonicalizeFountain = (fountain: string): string =>
  docToFountain(fountainToDoc(fountain));
