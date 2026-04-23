/**
 * Stunts extractor — IT lemma list.
 * Confidence ~60%, default `pending`.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  { display: "Combattimento", stem: "combattiment\\w*" },
  { display: "Lotta", stem: "lott\\w*" },
  { display: "Caduta", stem: "cadut\\w*" },
  { display: "Salto", stem: "salt[oi]" },
  { display: "Sparo", stem: "spar[oi]" },
  { display: "Inseguimento", stem: "inseguiment\\w*" },
  { display: "Fuga", stem: "fugh?\\w*" },
  { display: "Scontro", stem: "scontr[oi]" },
  { display: "Esplosione", stem: "esplosi\\w*" },
  { display: "Pugno", stem: "pugn[oi]" },
  { display: "Calcio", stem: "calci[oi]" },
  { display: "Schiaffo", stem: "schiaff[oi]" },
  { display: "Spintone", stem: "spinton\\w*" },
  { display: "Coltellata", stem: "coltellat\\w*" },
  { display: "Pistola", stem: "pistol\\w*" },
  { display: "Arma", stem: "arm[ie]" },
  { display: "Rissa", stem: "riss\\w*" },
  { display: "Volo", stem: "vol[oi]" },
  { display: "Tuffo", stem: "tuff[oi]" },
  { display: "Scivolata", stem: "scivol\\w*" },
  { display: "Incidente", stem: "incident[ei]" },
];

export const extractStunts = buildLemmaExtractor({
  category: "stunts",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
