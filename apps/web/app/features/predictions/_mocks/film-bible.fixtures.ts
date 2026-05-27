import type { FilmBible } from "@oh-writers/domain";

/**
 * Deterministic MOCK_AI fixture for Film Bible distillation (spec 38).
 *
 * Mirrors the "Non fa ridere" seed project: a dark comedy set entirely
 * inside a provincial restaurant in the Marche region. Bancone/Sala/Cucina
 * are grouped into one recurring location entry.
 */
const NON_FA_RIDERE_BIBLE: FilmBible = {
  schemaVersion: "1",
  settingSummary:
    "Piccolo ristorante di provincia nelle Marche, paesino di montagna. Anni contemporanei. Tono tragicomico.",
  genreAndTone: "Commedia nera. Tono amaro, ritmo serrato, dialoghi secchi.",
  centralConflict:
    "Dante, oste burbero, deve ospitare una serata di cabaret per sopravvivere economicamente, ma il comico scelto da Filippo non fa ridere nessuno.",
  productionConstraints: [
    "Quasi tutto in interni (ristorante)",
    "Poche scene in esterno notturno (strada del paese)",
    "Fuoco vivo in cucina (gas range)",
  ],
  recurringLocations: [
    {
      canonicalName: "Ristorante da Dante",
      aliases: ["Bancone", "Sala", "Cucina", "Angolo Open Grezzo"],
      locationType: "ristorante",
      sceneCount: 12,
      settingPrior:
        "small provincial restaurant, Marche region, central Italy — not a city restaurant",
    },
    {
      canonicalName: "Esterno ristorante / Strada del paese",
      aliases: ["Fuori dalla porta", "Strada del paese"],
      locationType: "strada",
      sceneCount: 3,
      settingPrior:
        "small-town street in front of a restaurant, Marche region, Italy",
    },
  ],
  keyCharacters: [
    {
      name: "DANTE",
      role: "Protagonist — oste burbero e disilluso",
      arc: "Impara a ridere di sé stesso solo quando tutto è già andato storto",
    },
    {
      name: "FILIPPO",
      role: "Deuteragonist — cameriere entusiasta e ingenuo",
      arc: "Capisce che le buone intenzioni non bastano",
    },
    {
      name: "TEA",
      role: "Personaggio di supporto — cuoca stoica",
      arc: null,
    },
  ],
  sourceDocumentSnapshot: "fixture",
};

const DEFAULT_BIBLE: FilmBible = {
  schemaVersion: "1",
  settingSummary: "Progetto senza soggetto — ambientazione non determinata.",
  genreAndTone: "Non determinato",
  centralConflict: "Non determinato",
  productionConstraints: [],
  recurringLocations: [],
  keyCharacters: [],
  sourceDocumentSnapshot: "fixture",
};

export const findFilmBibleFixture = (
  projectTitle: string,
  fingerprint: string,
): FilmBible => {
  const bible =
    projectTitle.toLowerCase().includes("ridere") ||
    projectTitle.toLowerCase().includes("dante")
      ? NON_FA_RIDERE_BIBLE
      : DEFAULT_BIBLE;
  return { ...bible, sourceDocumentSnapshot: fingerprint };
};
