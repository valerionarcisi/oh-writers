/**
 * Shared types for the auto-spoglio extractors (Spec 10e).
 *
 * Each extractor is a pure function from a piece of scene text (or heading)
 * to a list of `ExtractedItem`. No I/O, no React, no Drizzle — these run on
 * any runtime and are heavily unit-tested.
 *
 * The `defaultStatus` field is **confidence-based**:
 *   - `"accepted"` — the extractor is highly reliable for that category
 *     (Cast / Locations / Animals); the item appears as a regular Tag at
 *     first open of the breakdown.
 *   - `"pending"` — lower confidence (Vehicles, Sound, Atmosphere, Makeup,
 *     Stunts, Extras); the item appears as a CesareGhostTag the user can
 *     accept or ignore.
 */

import type { BreakdownCategory } from "../categories.js";

export type ExtractedSource = "regex";

export interface ExtractedItem {
  readonly category: BreakdownCategory;
  /** Canonical display name — Title Case, no trailing punctuation. */
  readonly name: string;
  /** Number of times the item appears in the input scene. ≥ 1. */
  readonly quantity: number;
  /** Confidence-based default cesareStatus when persisted. */
  readonly defaultStatus: "accepted" | "pending";
  /** Always `"regex"` for v1. Reserved for future ML/AI/manual sources. */
  readonly source: ExtractedSource;
}

/** A pure scene-body extractor. Heading is excluded from the input. */
export type Extractor = (sceneBody: string) => ExtractedItem[];

/**
 * Capitalize the first letter of each whitespace-separated word.
 * Locale-aware ("è" → "È"). Does not strip punctuation.
 */
export const titleCase = (raw: string): string =>
  raw
    .toLocaleLowerCase("it-IT")
    .split(/(\s+|\/)/)
    .map((part) =>
      /^\s+$|^\/$/.test(part)
        ? part
        : part.length === 0
          ? part
          : part[0]!.toLocaleUpperCase("it-IT") + part.slice(1),
    )
    .join("");
