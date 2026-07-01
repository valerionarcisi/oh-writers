import type { SceneSummary } from "@oh-writers/domain";

/**
 * Deterministic MOCK_AI fixtures for scene summary generation (spec 38).
 *
 * Keyed by scene number. The "Non fa ridere" seed screenplay has scenes
 * mostly inside a provincial restaurant (Ristorante da Dante) in the Marche.
 * Unknown scenes fall back to a generic interior fixture.
 */
const FIXTURES: Readonly<Record<number, SceneSummary>> = {
  1: {
    sceneNumber: 1,
    heading: "INT. RISTORANTE DA DANTE - BANCONE - GIORNO",
    settingDescription:
      "Counter area of a small provincial restaurant in the Marche region",
    timeOfDay: "GIORNO",
    presentCharacters: ["DANTE", "FILIPPO"],
    keyActions: [
      "Filippo arrives and greets Dante",
      "Dante wipes down the counter in silence",
      "Tense exchange about the evening show",
    ],
    productionNotes: [],
    narrativePurpose:
      "Establishes the tense dynamic between Dante and Filippo over the evening show",
  },
  2: {
    sceneNumber: 2,
    heading: "INT. RISTORANTE DA DANTE - SALA - SERA",
    settingDescription:
      "Dining room of a small provincial restaurant, tables set for dinner service",
    timeOfDay: "SERA",
    presentCharacters: ["DANTE", "FILIPPO", "TEA"],
    keyActions: [
      "Tea sets the tables",
      "Dante and Filippo argue about the comedian booking",
      "First customers arrive",
    ],
    productionNotes: ["Practical lighting from hanging bulbs"],
    narrativePurpose:
      "Raises the stakes of the comedian booking as service begins",
  },
  3: {
    sceneNumber: 3,
    heading: "INT. RISTORANTE DA DANTE - CUCINA - NOTTE",
    settingDescription:
      "Kitchen of a small provincial restaurant, stainless steel surfaces",
    timeOfDay: "NOTTE",
    presentCharacters: ["DANTE", "FILIPPO"],
    keyActions: [
      "Dante plates dishes while ranting",
      "Filippo defends his choice of comedian",
    ],
    productionNotes: ["Open flame gas range"],
    narrativePurpose:
      "Deepens Dante's frustration and Filippo's stubborn optimism",
  },
};

const DEFAULT_FIXTURE: SceneSummary = {
  sceneNumber: 0,
  heading: "SCENA GENERICA",
  settingDescription: "Generic interior location",
  timeOfDay: null,
  presentCharacters: [],
  keyActions: ["Characters interact"],
  productionNotes: [],
  narrativePurpose: "",
};

export const findSceneSummaryFixture = (
  sceneNumber: number,
  _heading: string,
): SceneSummary => {
  const fixture = FIXTURES[sceneNumber];
  return fixture
    ? { ...fixture, sceneNumber }
    : { ...DEFAULT_FIXTURE, sceneNumber };
};
