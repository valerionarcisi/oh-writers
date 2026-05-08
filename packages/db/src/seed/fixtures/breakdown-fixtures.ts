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
