/*
 * Revision coloring — Hollywood "colored pages" convention.
 *
 * v1 of any screenplay is always WHITE (first draft). From v2 onwards
 * revisions cycle through the remaining 9 colors in the canonical industry
 * order. The cycle never returns to WHITE: once you're off white, you stay
 * inside [BLUE..TAN] forever.
 */

export const DRAFT_REVISION_COLORS = [
  "white",
  "blue",
  "pink",
  "yellow",
  "green",
  "goldenrod",
  "buff",
  "salmon",
  "cherry",
  "tan",
] as const;

export type DraftRevisionColor = (typeof DRAFT_REVISION_COLORS)[number];

export const FIRST_DRAFT_COLOR: DraftRevisionColor = "white";

const CYCLE: ReadonlyArray<DraftRevisionColor> = DRAFT_REVISION_COLORS.slice(1);

const isKnownColor = (c: string | null | undefined): c is DraftRevisionColor =>
  c !== null &&
  c !== undefined &&
  (DRAFT_REVISION_COLORS as ReadonlyArray<string>).includes(c);

/**
 * Suggest the next revision color given the colors already in use, ordered
 * by version number ascending. The most recent color is the last element.
 *
 * - Empty list → "white" (first draft).
 * - List of one or more → next in the cycle [blue..tan], wrapping around.
 *   White is skipped; unknown / null entries fall back to "white" baseline.
 */
export const suggestNextColor = (
  existing: ReadonlyArray<DraftRevisionColor | null>,
): DraftRevisionColor => {
  if (existing.length === 0) return FIRST_DRAFT_COLOR;

  const last = existing[existing.length - 1];
  if (!isKnownColor(last) || last === FIRST_DRAFT_COLOR) return CYCLE[0]!;

  const idx = CYCLE.indexOf(last);
  return CYCLE[(idx + 1) % CYCLE.length]!;
};
