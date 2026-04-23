/**
 * Orchestrator — runs every RegEx extractor over a scene and returns the
 * merged list of `ExtractedItem`. Pure; safe to import from any runtime.
 *
 * Cast extraction expects a Fountain body (CHARACTER cues require body
 * structure). Location extraction expects a slugline. We accept both as
 * separate arguments to avoid re-parsing.
 */

import type { ExtractedItem } from "./types.js";
import { extractCast } from "./extract-cast.js";
import { extractLocation } from "./extract-location.js";
import { extractVehicles } from "./extract-vehicles.js";
import { extractAnimals } from "./extract-animals.js";
import { extractSound } from "./extract-sound.js";
import { extractAtmosphere } from "./extract-atmosphere.js";
import { extractMakeup } from "./extract-makeup.js";
import { extractStunts } from "./extract-stunts.js";
import { extractExtras } from "./extract-extras.js";

export interface ExtractAllInput {
  /** Scene heading (slugline). Empty string disables location extraction. */
  readonly heading: string;
  /** Scene body (no heading). The full action + dialogue text. */
  readonly body: string;
}

export const extractAll = ({
  heading,
  body,
}: ExtractAllInput): ExtractedItem[] => [
  ...extractCast(body),
  ...extractLocation(heading),
  ...extractVehicles(body),
  ...extractAnimals(body),
  ...extractSound(body),
  ...extractAtmosphere(body),
  ...extractMakeup(body),
  ...extractStunts(body),
  ...extractExtras(body),
];
