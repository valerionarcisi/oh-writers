/**
 * Atmosphere FX extractor — IT + EN weather and atmospheric conditions.
 * Confidence ~80%, default `pending`.
 *
 * Distinct from `sfx` (mechanical / pyro) and `sound` — atmosphere covers
 * what the AD needs to plan around: rain, wind, fog machines, snow effects.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  // Italian
  { display: "Pioggia", stem: "piogg\\w*" },
  { display: "Piove", stem: "piov(e|eva|ono|ev[ao])" },
  { display: "Neve", stem: "nev[ei]" },
  { display: "Nevica", stem: "nevic\\w*" },
  { display: "Vento", stem: "vent[oi]" },
  { display: "Tempesta", stem: "tempest\\w*" },
  { display: "Nebbia", stem: "nebbi\\w*" },
  { display: "Fumo", stem: "fum[oi]" },
  { display: "Foschia", stem: "foschi\\w*" },
  { display: "Tuono", stem: "tuon[oi]" },
  { display: "Lampo", stem: "lamp[oi]" },
  { display: "Grandine", stem: "grandin\\w*" },
  { display: "Sole cocente", stem: "sole\\s+cocente" },
  { display: "Nuvole", stem: "nuvol\\w*" },
  { display: "Brezza", stem: "brezz\\w*" },
  // English
  { display: "Rain", stem: "rains?(ing|ed)?" },
  { display: "Snow", stem: "snows?(ing|ed)?" },
  { display: "Wind", stem: "winds?" },
  { display: "Storm", stem: "storms?" },
  { display: "Fog", stem: "fog" },
  { display: "Smoke", stem: "smoke" },
  { display: "Haze", stem: "haze" },
  { display: "Thunder", stem: "thunder" },
  { display: "Lightning", stem: "lightning" },
  { display: "Hail", stem: "hail(ing|ed|s)?" },
  { display: "Clouds", stem: "clouds?" },
  { display: "Breeze", stem: "breezes?" },
  { display: "Blizzard", stem: "blizzards?" },
  { display: "Flood", stem: "floods?" },
];

export const extractAtmosphere = buildLemmaExtractor({
  category: "atmosphere",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
