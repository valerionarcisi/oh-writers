/**
 * Props extractor — IT lemma list.
 * Confidence ~50%, default `pending` (ghost tag).
 *
 * Spec 10e originally left `props` to Cesare on the grounds that props
 * require creativity. In practice an AD cares about concrete physical
 * objects mentioned in action lines (microfono, vassoio, pala, forbici…)
 * and those ARE regex-extractable with a small curated list. We keep the
 * list narrow and `pending`-by-default so the user confirms each tag —
 * Cesare still covers the long tail for anything not in the list.
 *
 * Scope principles for this list:
 *   - Only hand-held or scene-specific objects an AD would log on a
 *     prop sheet. No body parts, no food/drink (that's set dressing or
 *     catering), no clothing (that's wardrobe).
 *   - Prefer precise stems: "bicchier" not "bicchiere|bicchieri" — a
 *     single `\w*`-suffixed stem handles plurals.
 *   - Skip ambiguous nouns: "carta" (paper? map? card?), "borsa" (bag?
 *     purse? sports bag?) — those stay for Cesare.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  { display: "Microfono", stem: "microfon\\w*" },
  { display: "Vassoio", stem: "vassoi\\w*" },
  { display: "Bicchiere", stem: "bicchier\\w*" },
  { display: "Bottiglia", stem: "bottigli\\w*" },
  { display: "Pala", stem: "pala" },
  { display: "Scopa", stem: "scop[ae]" },
  { display: "Striscione", stem: "strisci\\w*" },
  { display: "Locandina", stem: "locandin\\w*" },
  { display: "Sigaretta", stem: "sigarett\\w*" },
  { display: "Accendino", stem: "accendin\\w*" },
  { display: "Forbici", stem: "forbic\\w*" },
  { display: "Pianta", stem: "pianta" },
  { display: "Vaso", stem: "vas[oi]" },
  { display: "Fascina di legna", stem: "fascin[ae]\\s+di\\s+legn[ae]" },
  { display: "Moneta", stem: "monet\\w*" },
  { display: "Telefono", stem: "telefon\\w*" },
  { display: "Cellulare", stem: "cellular\\w*" },
  { display: "Chiavi", stem: "chiav[ie]" },
  { display: "Ombrello", stem: "ombrell\\w*" },
  { display: "Valigia", stem: "valig\\w*" },
  { display: "Zaino", stem: "zain\\w*" },
  { display: "Borsetta", stem: "borsett\\w*" },
  { display: "Orologio", stem: "orolog\\w*" },
  { display: "Occhiali", stem: "occhial[ie]" },
  { display: "Libro", stem: "libr[oi]" },
  { display: "Giornale", stem: "giornal[ei]" },
  { display: "Pistola", stem: "pistol\\w*" },
  { display: "Coltello", stem: "coltell\\w*" },
  { display: "Pala da pizza", stem: "pala\\s+da\\s+pizza" },
  { display: "Grembiule", stem: "grembiul\\w*" },
];

export const extractProps = buildLemmaExtractor({
  category: "props",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
