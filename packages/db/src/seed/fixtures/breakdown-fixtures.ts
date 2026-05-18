// Deterministic UUIDs used by Spec 10 breakdown tests + seed helpers.
// Scenes are seeded for the team project so the /breakdown route always has
// something to render and so element/occurrence FKs resolve.

export const TEST_BREAKDOWN_SCENE_1_ID = "00000000-0000-4000-a000-000000010010";
export const TEST_BREAKDOWN_SCENE_2_ID = "00000000-0000-4000-a000-000000010011";

export const TEST_BREAKDOWN_ELEMENT_ID = "00000000-0000-4000-a000-000000010001";
export const TEST_BREAKDOWN_OCCURRENCE_ID =
  "00000000-0000-4000-a000-000000010002";

export interface SeededScene {
  id: string;
  number: number;
  heading: string;
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: string | null;
  notes: string | null;
}

// Fixed UUIDs for scenes 3-5 (Cesare RAG window tests require n±2 from scene 3)
export const TEST_BREAKDOWN_SCENE_3_ID = "00000000-0000-4000-a000-000000010012";
export const TEST_BREAKDOWN_SCENE_4_ID = "00000000-0000-4000-a000-000000010013";
export const TEST_BREAKDOWN_SCENE_5_ID = "00000000-0000-4000-a000-000000010014";

export const TEAM_PROJECT_BREAKDOWN_SCENES: SeededScene[] = [
  {
    id: TEST_BREAKDOWN_SCENE_1_ID,
    number: 1,
    heading: "INT. APPARTAMENTO - NOTTE",
    intExt: "INT",
    location: "APPARTAMENTO",
    timeOfDay: "NOTTE",
    // Notes include a Bloody knife prop and John's dialogue so OHW-514 can
    // ask "Cosa dice John?" and get a real answer from Cesare's RAG context.
    notes: `Marco impugna un Bloody knife sul tavolo. Una bottiglia di vino rotta accanto.

JOHN
(sottovoce)
Non avrei mai dovuto tornare in questo posto.

John fissa la lama. Le sue mani tremano lentamente.

MARCO
Siediti. Parliamo da uomini.

JOHN
Non c'è niente da dire, Marco. È finita.

Marco spinge via la bottiglia. Si avvicina. La stanza è silenziosa tranne per il vento che entra dalla finestra aperta.`,
  },
  {
    id: TEST_BREAKDOWN_SCENE_2_ID,
    number: 2,
    heading: "EXT. STRADA - GIORNO",
    intExt: "EXT",
    location: "STRADA",
    timeOfDay: "GIORNO",
    notes: `Sara cammina veloce sul marciapiede. Una macchina rossa sfreccia senza fermarsi.

Sara si volta, spaventata. Osserva la targa: non riesce a leggerla.

SARA
(tra sé)
Adesso capisco.

Tira fuori il telefono. Cerca un numero. Esita.`,
  },
  {
    id: TEST_BREAKDOWN_SCENE_3_ID,
    number: 3,
    heading: "INT. COMMISSARIATO - GIORNO",
    intExt: "INT",
    location: "COMMISSARIATO",
    timeOfDay: "GIORNO",
    // Central scene for OHW-514b: window n±2 from scene 3 covers scenes 1-5.
    notes: `L'ispettore Ferretti appoggia una cartella sul tavolo. Sara è seduta di fronte a lui.

FERRETTI
Vuole spiegarmi cosa ci faceva in quella strada?

SARA
Stavo andando a trovare mia sorella.

FERRETTI
A quest'ora? Con quel tempo?

Sara non risponde subito. Guarda fuori dalla finestra sporca di pioggia.

SARA
Sì. Era urgente.

Ferretti annota qualcosa. Sul muro dietro di lui ci sono foto di scena del crimine — la bottiglia di vino, il coltello, l'appartamento.`,
  },
  {
    id: TEST_BREAKDOWN_SCENE_4_ID,
    number: 4,
    heading: "INT. CORRIDOIO OSPEDALE - NOTTE",
    intExt: "INT",
    location: "CORRIDOIO OSPEDALE",
    timeOfDay: "NOTTE",
    notes: `Le luci al neon lampeggiano. John cammina lentamente lungo il corridoio vuoto.

Un medico esce da una porta laterale.

MEDICO
Stia tranquillo. È stabile.

JOHN
Posso vederla?

MEDICO
Ancora no. Le diamo notizie al mattino.

John si siede su una sedia di plastica. Chiude gli occhi. Nella tasca della giacca, il telefono vibra ripetutamente — non risponde.`,
  },
  {
    id: TEST_BREAKDOWN_SCENE_5_ID,
    number: 5,
    heading: "EXT. CORTILE INTERNO - ALBA",
    intExt: "EXT",
    location: "CORTILE INTERNO",
    timeOfDay: "ALBA",
    notes: `Marco esce dalla porta sul retro. Porta una borsa da viaggio. Si guarda intorno.

Il cortile è deserto. Un gatto attraversa la scena.

Marco raggiunge un motorino parcheggiato nell'angolo. Mette la borsa sul portabagagli. Si ferma un momento — guarda su verso le finestre illuminate dell'appartamento.

Poi parte.`,
  },
];

export const SEEDED_BREAKDOWN_ELEMENT_NAME = "Bloody knife";
export const SEEDED_BREAKDOWN_ELEMENT_CATEGORY = "props" as const;

// Pending Cesare suggestions seeded for Spec 10c E2E (ghost popover flow).
// Scene-1 ghosts are consumed by the breakdown-ignore spec (which runs first
// alphabetically). Scene-2 ghosts are reserved for OHW-284/285/286 so those
// tests always find pending ghosts regardless of what earlier specs clear.
export const SEEDED_PENDING_ELEMENT_CATEGORY = "cast" as const;
export const SEEDED_PENDING_GHOSTS_SCENE1: ReadonlyArray<{
  occurrenceId: string;
  elementId: string;
  name: string;
}> = [
  {
    occurrenceId: "00000000-0000-4000-a000-000000010104",
    elementId: "00000000-0000-4000-a000-000000010204",
    name: "Tea",
  },
  {
    occurrenceId: "00000000-0000-4000-a000-000000010105",
    elementId: "00000000-0000-4000-a000-000000010205",
    name: "Milco",
  },
  {
    occurrenceId: "00000000-0000-4000-a000-000000010106",
    elementId: "00000000-0000-4000-a000-000000010206",
    name: "Luca",
  },
];

// Scene-2 ghosts: stable across the full test suite because breakdown-ignore
// only ever clears scene-1 ghosts (it calls openSceneInBreakdown(page, 1)).
// Names MUST appear in the non-fa-ridere.fountain.ts text so the ghost
// decoration plugin can find text matches to render.
// Giulio (11×), Gemma (5×), Gianna (3×) all appear in the screenplay.
export const SEEDED_PENDING_GHOSTS_SCENE2: ReadonlyArray<{
  occurrenceId: string;
  elementId: string;
  name: string;
}> = [
  {
    occurrenceId: "00000000-0000-4000-a000-000000010107",
    elementId: "00000000-0000-4000-a000-000000010207",
    name: "Giulio",
  },
  {
    occurrenceId: "00000000-0000-4000-a000-000000010108",
    elementId: "00000000-0000-4000-a000-000000010208",
    name: "Gemma",
  },
  {
    occurrenceId: "00000000-0000-4000-a000-000000010109",
    elementId: "00000000-0000-4000-a000-000000010209",
    name: "Gianna",
  },
];

// Kept for backwards compat — points to scene-1 set.
export const SEEDED_PENDING_GHOSTS = SEEDED_PENDING_GHOSTS_SCENE1;
