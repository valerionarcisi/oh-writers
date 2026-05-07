/**
 * Sound FX extractor — IT + EN lemma list + Fountain VO/OS markers.
 * Confidence ~60%, default `pending`.
 *
 * Includes the "(V.O.)" and "(O.S.)" Fountain extensions because they imply
 * an off-camera vocal source the sound team needs to record/mix separately.
 * V.O. / O.S. are language-agnostic Fountain conventions already in the list.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  // Italian
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
  // English
  { display: "Doorbell", stem: "doorbells?" },
  { display: "Phone ring", stem: "phone\\s+ring(s|ing)?" },
  { display: "Siren", stem: "sirens?" },
  { display: "Alarm", stem: "alarms?" },
  { display: "Scream", stem: "screams?(ing|ed)?" },
  { display: "Shout", stem: "shouts?(ing|ed)?" },
  { display: "Yell", stem: "yells?(ing|ed)?" },
  { display: "Applause", stem: "applause" },
  { display: "Laughter", stem: "laughter" },
  { display: "Gunshot", stem: "gunshots?" },
  { display: "Explosion", stem: "explosions?" },
  { display: "Crash", stem: "crashes?" },
  { display: "Horn", stem: "horns?" },
  { display: "Music", stem: "music" },
  { display: "Knock", stem: "knocks?(ing|ed)?" },
  { display: "Knock on the door", stem: "knock(ing)?\\s+on\\s+the\\s+door" },
];

export const extractSound = buildLemmaExtractor({
  category: "sound",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
