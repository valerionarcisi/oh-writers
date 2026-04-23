/**
 * Animals extractor — IT lemma list.
 * Confidence ~90%, default `accepted`.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  { display: "Cane", stem: "can[ei]" },
  { display: "Cucciolo", stem: "cuccioli?" },
  { display: "Gatto", stem: "gatt[oi]" },
  { display: "Cavallo", stem: "caval[li]\\w*" },
  { display: "Pecora", stem: "pecor\\w*" },
  { display: "Mucca", stem: "mucc\\w*" },
  { display: "Vacca", stem: "vacc\\w*" },
  { display: "Toro", stem: "tor[oi]" },
  { display: "Capra", stem: "capr\\w*" },
  { display: "Maiale", stem: "maial\\w*" },
  { display: "Gallina", stem: "gallin\\w*" },
  { display: "Gallo", stem: "gall[oi]" },
  { display: "Pollo", stem: "poll[oi]" },
  { display: "Anatra", stem: "anatr\\w*" },
  { display: "Uccello", stem: "uccell\\w*" },
  { display: "Piccione", stem: "piccion\\w*" },
  { display: "Corvo", stem: "corv[oi]" },
  { display: "Gabbiano", stem: "gabbian\\w*" },
  { display: "Topo", stem: "top[oi]" },
  { display: "Ratto", stem: "ratt[oi]" },
  { display: "Coniglio", stem: "conigli?" },
  { display: "Serpente", stem: "serpent[ei]" },
  { display: "Ragno", stem: "ragn[oi]" },
  { display: "Ape", stem: "ap[ei]" },
  { display: "Mosca", stem: "mosch?\\w*" },
  { display: "Pesce", stem: "pesc[ei]" },
  { display: "Asino", stem: "asin[oi]" },
  { display: "Lupo", stem: "lup[oi]" },
  { display: "Volpe", stem: "volp[ei]" },
  { display: "Cervo", stem: "cerv[oi]" },
];

export const extractAnimals = buildLemmaExtractor({
  category: "animals",
  defaultStatus: "accepted",
  lemmas: LEMMAS,
});
