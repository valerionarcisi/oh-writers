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

// Issue #36 — the ratio is relative, so on a tiny doc (a logline, a one-line
// soggetto) any real edit trivially exceeds 40% ("143% del testo cambia" for a
// one-word typo fix), and the ask-card over-fires on changes no human calls
// "large". Below this many words in the previous doc, the ratio branch is
// disabled and only the absolute LARGE_EDIT_WORDS floor can classify "large" —
// so a short doc only asks when the change itself is genuinely big in absolute
// terms (e.g. a 250-word append), never just because it's short.
export const LARGE_EDIT_MIN_PREV_WORDS = 40;

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
/**
 * The fraction of the document this edit changed: (added + removed words) /
 * max(prevWords, 1). Exposed so the large-edit ask card can show the writer how
 * big the change is, computed in ONE place (no drift from `classifyEditSize`).
 */
export const changedWordRatio = (
  previousContent: string,
  nextContent: string,
): number => {
  const segments = buildWordDiffSegments(previousContent, nextContent);

  let changedWords = 0;
  for (const seg of segments) {
    if (seg.op === "eq") continue;
    changedWords += countWords(seg.text);
  }

  const prevWords = countWords(previousContent);
  return changedWords / Math.max(prevWords, 1);
};

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

  // A first write (nothing to overwrite) is the largest possible change — the
  // resolver mints regardless, but keep the size signal honest on its own.
  if (prevWords === 0) return "large";

  const ratio = changedWords / prevWords;

  // The relative-ratio branch only counts once the doc is long enough that "40%
  // changed" describes a genuinely large edit (#36). On a short doc, fall back
  // to the absolute floor alone.
  const ratioIsLarge =
    prevWords >= LARGE_EDIT_MIN_PREV_WORDS && ratio >= LARGE_EDIT_RATIO;

  return ratioIsLarge || changedWords >= LARGE_EDIT_WORDS ? "large" : "small";
};
