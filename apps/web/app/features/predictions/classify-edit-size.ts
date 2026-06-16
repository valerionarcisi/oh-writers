import { buildWordDiffSegments } from "@oh-writers/utils";

// BUG-N66 / Spec 76 — classify a Cesare edit as "small" (overwrite the active
// version in place) or "large" (Cesare asks before minting a new version). Pure,
// AI-free, deterministic: the same before/after always yields the same verdict.
//
// "Large" when the edit reshapes a meaningful fraction of the document OR moves
// a large absolute number of words (a big append to a short doc is still large).
// Tuned against the real-use session that produced v13/v14/v15; the thresholds
// are the single knob and live here.

export type EditSize = "small" | "large";

export const LARGE_EDIT_RATIO = 0.4;
export const LARGE_EDIT_WORDS = 250;

const countWords = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;

/**
 * Classify the change from `previousContent` to `nextContent`. Inputs may be
 * HTML (ProseMirror serialisation) or plain text — `buildWordDiffSegments`
 * normalises both to plain prose before diffing, so the count is on words the
 * user actually sees, not markup.
 *
 * An empty `previousContent` is a FIRST WRITE, which the version-action resolver
 * treats as a mint regardless; we still return "large" here so the size signal
 * is honest on its own (a from-nothing write is the largest possible change).
 */
export const classifyEditSize = (
  previousContent: string,
  nextContent: string,
): EditSize => {
  const segments = buildWordDiffSegments(previousContent, nextContent);

  let changedWords = 0;
  for (const seg of segments) {
    if (seg.op === "eq") continue;
    changedWords += countWords(seg.text);
  }

  const prevWords = countWords(previousContent);
  const ratio = changedWords / Math.max(prevWords, 1);

  return ratio >= LARGE_EDIT_RATIO || changedWords >= LARGE_EDIT_WORDS
    ? "large"
    : "small";
};
