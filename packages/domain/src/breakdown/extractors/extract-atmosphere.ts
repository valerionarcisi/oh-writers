/**
 * Atmosphere FX extractor — weather and atmospheric conditions.
 * Confidence ~80%, default `pending`.
 *
 * Distinct from `sfx` (mechanical / pyro) and `sound` — atmosphere covers
 * what the AD needs to plan around: rain, wind, fog machines, snow effects.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
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
];

export const extractAtmosphere = buildLemmaExtractor({
  category: "atmosphere",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
