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
import { extractProps } from "./extract-props.js";
import { stripFountainDialogue } from "./strip-fountain-dialogue.js";

export interface ExtractAllInput {
  /** Scene heading (slugline). Empty string disables location extraction. */
  readonly heading: string;
  /** Scene body (no heading). The full action + dialogue text. */
  readonly body: string;
}

export const extractAll = ({
  heading,
  body,
}: ExtractAllInput): ExtractedItem[] => {
  // Strip dialogue lines so lemma extractors don't match words spoken inside
  // dialogue (a character saying "gun" ≠ a prop appearing in action text).
  // Cast and sound receive the full body: cast needs character cue structure;
  // sound catches V.O./O.S. extensions that live on character cue lines.
  const actionBody = stripFountainDialogue(body);
  return [
    ...extractCast(body),
    ...extractLocation(heading),
    ...extractVehicles(actionBody),
    ...extractAnimals(actionBody),
    ...extractSound(body),
    ...extractAtmosphere(actionBody),
    ...extractMakeup(actionBody),
    ...extractStunts(actionBody),
    ...extractExtras(actionBody),
    ...extractProps(actionBody),
  ];
};
