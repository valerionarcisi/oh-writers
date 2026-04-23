/**
 * Location extractor — parses a Fountain scene heading into one or more
 * location names.
 *
 * Input: the **heading** line, NOT the body (locations live in the slugline).
 *
 * Heuristic:
 *   1. Strip the prefix (`INT.`, `EXT.`, `INT/EXT.`, `EST.`, `I/E.`).
 *   2. Drop the trailing time-of-day after the last ` - ` (e.g. " - NOTTE").
 *   3. The remainder is the location title; if it contains `/` (compound
 *      heading "ANGOLO OPEN GREZZO/FUORI DALLA PORTA") split into two
 *      locations.
 *   4. Title-case each piece.
 *
 * Returns one `ExtractedItem` per distinct location, all with quantity 1
 * and `accepted` default status (heading parsing is ~95% reliable).
 */

import type { ExtractedItem } from "./types.js";
import { titleCase } from "./types.js";

// Longest alternatives first — JS regex alternation is greedy from the left,
// so `INT\/EXT` must be tried before `INT` or `EXT` to avoid partial consumption.
const PREFIX_RE =
  /^(INT\.?\/EXT|EXT\.?\/INT|INT\/EXT|EXT\/INT|I\/E|INT|EXT|EST)\.?\s*/i;

export const extractLocation = (sceneHeading: string): ExtractedItem[] => {
  const trimmed = sceneHeading.trim();
  if (trimmed.length === 0) return [];

  const noPrefix = trimmed.replace(PREFIX_RE, "").trim();
  if (noPrefix.length === 0) return [];

  // Drop the time-of-day after the last " - "
  const parts = noPrefix.split(/\s+-\s+/);
  const locationPart =
    parts.length > 1 ? parts.slice(0, -1).join(" - ") : noPrefix;

  // Compound heading: split on "/" so each location becomes its own item.
  const pieces = locationPart
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const seen = new Set<string>();
  const items: ExtractedItem[] = [];
  for (const piece of pieces) {
    const canonical = titleCase(piece);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    items.push({
      category: "locations",
      name: canonical,
      quantity: 1,
      defaultStatus: "accepted",
      source: "regex",
    });
  }
  return items;
};
