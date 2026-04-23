/**
 * Sound FX extractor — IT lemma list + Fountain VO/OS markers.
 * Confidence ~60%, default `pending`.
 *
 * Includes the "(V.O.)" and "(O.S.)" Fountain extensions because they imply
 * an off-camera vocal source the sound team needs to record/mix separately.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  { display: "Campanello", stem: "campanell[oi]" },
  { display: "Squillo telefono", stem: "squill\\w*" },
  { display: "Telefono", stem: "telefon\\w*" },
  { display: "Sirena", stem: "siren\\w*" },
  { display: "Allarme", stem: "allarm[ei]" },
  { display: "Urla", stem: "url(a|e|are|ano|ò|ava)" },
  { display: "Grido", stem: "grid[oa]" },
  { display: "Applauso", stem: "applaus[oi]" },
  { display: "Risate", stem: "risat\\w*" },
  { display: "Sparo", stem: "spar[oi]" },
  { display: "Esplosione", stem: "esplosi\\w*" },
  { display: "Rumore", stem: "rumor[ei]" },
  { display: "Boato", stem: "boat[oi]" },
  { display: "Tonfo", stem: "tonf[oi]" },
  { display: "Schianto", stem: "schiant[oi]" },
  { display: "Clacson", stem: "clacson" },
  { display: "Frenata", stem: "frenat\\w*" },
  { display: "Voice over", stem: "V\\.O\\." },
  { display: "Off screen", stem: "O\\.S\\." },
  { display: "Musica", stem: "music\\w*" },
  { display: "Radio", stem: "radio" },
  { display: "Tv", stem: "tv" },
  { display: "Televisione", stem: "televisi\\w*" },
  { display: "Bussare alla porta", stem: "buss(a|are|ata|arono|ò)" },
];

export const extractSound = buildLemmaExtractor({
  category: "sound",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
