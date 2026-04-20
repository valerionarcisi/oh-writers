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

export const TEAM_PROJECT_BREAKDOWN_SCENES: SeededScene[] = [
  {
    id: TEST_BREAKDOWN_SCENE_1_ID,
    number: 1,
    heading: "INT. APPARTAMENTO - NOTTE",
    intExt: "INT",
    location: "APPARTAMENTO",
    timeOfDay: "NOTTE",
    notes:
      "Marco impugna un Bloody knife sul tavolo. Una bottiglia di vino rotta accanto.",
  },
  {
    id: TEST_BREAKDOWN_SCENE_2_ID,
    number: 2,
    heading: "EXT. STRADA - GIORNO",
    intExt: "EXT",
    location: "STRADA",
    timeOfDay: "GIORNO",
    notes: "Sara cammina veloce. Una macchina rossa sfreccia.",
  },
];

export const SEEDED_BREAKDOWN_ELEMENT_NAME = "Bloody knife";
export const SEEDED_BREAKDOWN_ELEMENT_CATEGORY = "props" as const;
