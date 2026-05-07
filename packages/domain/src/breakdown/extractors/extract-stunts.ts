/**
 * Stunts extractor — IT + EN lemma list.
 * Confidence ~60%, default `pending`.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  // Italian
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
  // English
  { display: "Fight", stem: "fights?(ing|er)?" },
  { display: "Struggle", stem: "struggles?(ing|d)?" },
  { display: "Fall", stem: "falls?(ing|en)?" },
  { display: "Jump", stem: "jumps?(ing|ed)?" },
  { display: "Chase", stem: "chases?(ing|d)?" },
  { display: "Escape", stem: "escapes?(ing|d)?" },
  { display: "Crash", stem: "crashes?(ing|d)?" },
  { display: "Explosion", stem: "explosions?" },
  { display: "Punch", stem: "punches?" },
  { display: "Kick", stem: "kicks?(ing|ed)?" },
  { display: "Slap", stem: "slaps?(ping|ped)?" },
  { display: "Stab", stem: "stabs?(bing|bed)?" },
  { display: "Shoot", stem: "shoots?(ing)?" },
  { display: "Gun", stem: "guns?" },
  { display: "Weapon", stem: "weapons?" },
  { display: "Brawl", stem: "brawls?(ing|ed)?" },
  { display: "Dive", stem: "dives?(ing|d)?" },
  { display: "Slide", stem: "slides?(ing|d)?" },
  { display: "Car chase", stem: "car\\s+chase" },
];

export const extractStunts = buildLemmaExtractor({
  category: "stunts",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
