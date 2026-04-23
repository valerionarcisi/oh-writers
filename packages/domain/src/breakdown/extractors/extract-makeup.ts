/**
 * Makeup-SFX extractor — IT lemma list.
 * Confidence ~70%, default `pending`.
 *
 * Targets prosthetic / makeup effects the trucco department needs to prep:
 * blood, wounds, scars, dirt, sweat. Not regular makeup (everyone wears it).
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  { display: "Sangue", stem: "sangu(e|ina\\w*)" },
  { display: "Ferita", stem: "ferit\\w*" },
  { display: "Taglio", stem: "tagli[oi]" },
  { display: "Cicatrice", stem: "cicatr\\w*" },
  { display: "Livido", stem: "livid[oi]" },
  { display: "Contusione", stem: "contusion\\w*" },
  { display: "Lacrime", stem: "lacrim\\w*" },
  { display: "Sudore", stem: "sudor[ei]" },
  { display: "Sudato", stem: "sudat[oa]" },
  { display: "Vomito", stem: "vomit\\w*" },
  { display: "Sporco", stem: "sporc[oa]" },
  { display: "Fango", stem: "fang[oi]" },
  { display: "Cerone", stem: "ceron\\w*" },
  { display: "Trucco di scena", stem: "trucco\\s+di\\s+scena" },
  { display: "Barba finta", stem: "barba\\s+finta" },
  { display: "Parrucca", stem: "parrucc\\w*" },
  { display: "Bruciatura", stem: "bruciatur\\w*" },
  { display: "Ustione", stem: "ustion\\w*" },
];

export const extractMakeup = buildLemmaExtractor({
  category: "makeup",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
