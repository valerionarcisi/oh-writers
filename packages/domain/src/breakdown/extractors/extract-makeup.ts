/**
 * Makeup-SFX extractor — IT + EN lemma list.
 * Confidence ~70%, default `pending`.
 *
 * Targets prosthetic / makeup effects the trucco department needs to prep:
 * blood, wounds, scars, dirt, sweat. Not regular makeup (everyone wears it).
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  // Italian
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
  // English
  { display: "Blood", stem: "blood(y|ied|ying)?" },
  { display: "Wound", stem: "wounds?(ing|ed)?" },
  { display: "Cut", stem: "cuts?" },
  { display: "Scar", stem: "scars?" },
  { display: "Bruise", stem: "bruises?(ing|d)?" },
  { display: "Tears", stem: "tears?" },
  { display: "Sweat", stem: "sweats?(y|ing|ed)?" },
  { display: "Vomit", stem: "vomits?(ing|ed)?" },
  { display: "Dirty", stem: "dirty|dirt\\b" },
  { display: "Mud", stem: "mudd?y?" },
  { display: "Burn", stem: "burns?(ing|ed|t)?" },
  { display: "Wig", stem: "wigs?" },
  { display: "Prosthetic", stem: "prosthetics?" },
  { display: "Fake beard", stem: "fake\\s+beard" },
];

export const extractMakeup = buildLemmaExtractor({
  category: "makeup",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
