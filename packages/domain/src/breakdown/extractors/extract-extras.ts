/**
 * Extras extractor — IT crowd / background patterns.
 * Confidence ~50%, default `pending`.
 *
 * Each lemma's `display` becomes the breakdown element name; the stem is
 * the pattern that triggers the match. Quantity = number of matches.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  { display: "Folla", stem: "(una\\s+)?fol(la|le)" },
  { display: "Avventori", stem: "avventor[ei]" },
  { display: "Pubblico", stem: "pubblic[oi]" },
  { display: "Clienti", stem: "client[ei]" },
  { display: "Passanti", stem: "passant[ei]" },
  { display: "Tifosi", stem: "tifos[ei]" },
  { display: "Spettatori", stem: "spettator[ei]" },
  { display: "Manifestanti", stem: "manifestant[ei]" },
  { display: "Gente", stem: "(la\\s+)?gente" },
  { display: "Bambini", stem: "(un\\s+gruppo\\s+di\\s+)?bambin[ei]" },
  { display: "Studenti", stem: "student[ei]" },
  { display: "Turisti", stem: "turist[ei]" },
  { display: "Operai", stem: "opera[ie]" },
];

export const extractExtras = buildLemmaExtractor({
  category: "extras",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
