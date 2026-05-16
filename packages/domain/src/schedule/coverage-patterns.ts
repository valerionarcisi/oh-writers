import type { ShotSize, CameraMovement } from "./effort-weights";

export const PATTERN_IDS = [
  "master_only",
  "master_plus_mids",
  "coverage_standard",
  "shot_reverse_shot",
  "three_way_dialogue",
  "action_handheld",
] as const;

export type PatternId = (typeof PATTERN_IDS)[number];

export interface PatternShotInput {
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  notesHint: string | null;
}

export interface CoveragePattern {
  id: PatternId;
  label: string;
  description: string;
  shots: PatternShotInput[];
  estimatedMinutesHint: number;
}

export const COVERAGE_PATTERNS: Record<PatternId, CoveragePattern> = {
  master_only: {
    id: "master_only",
    label: "Master only",
    description: "Solo master shot, scena breve",
    shots: [{ shotSize: "WS", cameraMovement: "STATIC", notesHint: "master" }],
    estimatedMinutesHint: 45,
  },
  master_plus_mids: {
    id: "master_plus_mids",
    label: "Master + medi",
    description: "WS + 2 MS, scena monologo o copertura essenziale",
    shots: [
      { shotSize: "WS", cameraMovement: "STATIC", notesHint: "master" },
      { shotSize: "MS", cameraMovement: "STATIC", notesHint: null },
      { shotSize: "MS", cameraMovement: "STATIC", notesHint: null },
    ],
    estimatedMinutesHint: 95,
  },
  coverage_standard: {
    id: "coverage_standard",
    label: "Coverage standard",
    description: "WS + 2 MS + 2 CU, copertura completa standard",
    shots: [
      { shotSize: "WS", cameraMovement: "STATIC", notesHint: "master" },
      { shotSize: "MS", cameraMovement: "STATIC", notesHint: null },
      { shotSize: "MS", cameraMovement: "STATIC", notesHint: null },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: null },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: null },
    ],
    estimatedMinutesHint: 155,
  },
  shot_reverse_shot: {
    id: "shot_reverse_shot",
    label: "Campo / controcampo",
    description: "2 OTS + 2 CU per dialogo a 2 personaggi",
    shots: [
      { shotSize: "OTS", cameraMovement: "STATIC", notesHint: "campo" },
      { shotSize: "OTS", cameraMovement: "STATIC", notesHint: "controcampo" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "primo personaggio" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "secondo personaggio" },
    ],
    estimatedMinutesHint: 155,
  },
  three_way_dialogue: {
    id: "three_way_dialogue",
    label: "Dialogo a 3",
    description: "WS + 3 CU singoli per dialogo a 3+ personaggi",
    shots: [
      { shotSize: "WS", cameraMovement: "STATIC", notesHint: "master a 3" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "primo personaggio" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "secondo personaggio" },
      { shotSize: "CU", cameraMovement: "STATIC", notesHint: "terzo personaggio" },
    ],
    estimatedMinutesHint: 125,
  },
  action_handheld: {
    id: "action_handheld",
    label: "Action handheld",
    description: "WS + 4 MS handheld per sequenze action / SFX",
    shots: [
      { shotSize: "WS", cameraMovement: "STATIC", notesHint: "establishing" },
      { shotSize: "MS", cameraMovement: "HANDHELD", notesHint: null },
      { shotSize: "MS", cameraMovement: "HANDHELD", notesHint: null },
      { shotSize: "MS", cameraMovement: "HANDHELD", notesHint: null },
      { shotSize: "MS", cameraMovement: "HANDHELD", notesHint: null },
    ],
    estimatedMinutesHint: 110,
  },
};
