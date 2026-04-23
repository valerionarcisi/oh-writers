/**
 * Generic lemma-list extractor.
 *
 * A lemma is the canonical singular form of a word ("macchina"). Each lemma
 * declares the regex stem used to detect occurrences (handles plurals and
 * inflected forms via a small `\w*` suffix on the stem).
 *
 * Extractors built on this helper share the same behaviour:
 *   - Match is **case-insensitive**, **word-bounded** (`\b…\b`).
 *   - Quantity = number of matches in the body (not the number of distinct
 *     forms).
 *   - The canonical `name` is the lemma's `display`, Title Case.
 *
 * Keeping the lemma lists small (~20-50 entries) and stems precise is the
 * way we keep precision high. Cesare covers the long tail — RegEx is the
 * "always-on baseline".
 */

import type { BreakdownCategory } from "../categories.js";
import type { ExtractedItem, Extractor } from "./types.js";
import { titleCase } from "./types.js";

export interface Lemma {
  /** Canonical singular display name. */
  readonly display: string;
  /** Regex stem (no `\b`, no flags). Match becomes `\b<stem>\b`. */
  readonly stem: string;
}

export interface LemmaExtractorConfig {
  readonly category: BreakdownCategory;
  readonly defaultStatus: "accepted" | "pending";
  readonly lemmas: readonly Lemma[];
}

/**
 * Build a single combined regex per lemma — compiled once per call.
 *
 * We use a manual "alphanumeric boundary" (negative lookaround) instead of
 * `\b` so stems ending in a literal `.` (e.g. `V\.O\.`) still match: `\b`
 * requires a transition between word / non-word characters, which doesn't
 * trigger between `.` and whitespace.
 */
const buildLemmaRegex = (stem: string): RegExp =>
  new RegExp(`(?<![A-Za-z0-9])(?:${stem})(?![A-Za-z0-9])`, "giu");

export const buildLemmaExtractor =
  (config: LemmaExtractorConfig): Extractor =>
  (sceneBody) => {
    if (sceneBody.length === 0) return [];
    const items: ExtractedItem[] = [];
    for (const lemma of config.lemmas) {
      const re = buildLemmaRegex(lemma.stem);
      const matches = sceneBody.match(re);
      if (!matches || matches.length === 0) continue;
      items.push({
        category: config.category,
        name: titleCase(lemma.display),
        quantity: matches.length,
        defaultStatus: config.defaultStatus,
        source: "regex",
      });
    }
    return items;
  };
