import { z } from "zod";

// Shot size enum values (ordered from widest to tightest — order matters for inferTransitions)
export const ShotSizes = {
  EWS: "EWS",
  WS: "WS",
  MS: "MS",
  MCU: "MCU",
  CU: "CU",
  ECU: "ECU",
  INSERT: "INSERT",
  OTS: "OTS",
  TWO_SHOT: "TWO_SHOT",
  POV: "POV",
} as const;
export type ShotSize = (typeof ShotSizes)[keyof typeof ShotSizes];

export const SHOT_SIZE_LABELS: Record<ShotSize, string> = {
  EWS: "Extreme Wide Shot — soggetto piccolo, ambiente dominante",
  WS: "Wide Shot — figura intera con ambiente",
  MS: "Medium Shot — dalla vita in su",
  MCU: "Medium Close-Up — dal petto al mento",
  CU: "Close-Up — primo piano (volto)",
  ECU: "Extreme Close-Up — dettaglio (occhi, labbra)",
  INSERT: "Insert — dettaglio di un oggetto o azione",
  OTS: "Over The Shoulder — da dietro le spalle di un personaggio",
  TWO_SHOT: "Two Shot — due personaggi in campo",
  POV: "Point of View — soggettiva del personaggio",
};

// Shot size order for distance calculations (INSERT/OTS/TWO_SHOT/POV are excluded from jump check)
export const SHOT_SIZE_ORDER: Record<string, number> = {
  EWS: 0,
  WS: 1,
  MS: 2,
  MCU: 3,
  CU: 4,
  ECU: 5,
};

export const CameraMovements = {
  STATIC: "STATIC",
  PAN: "PAN",
  TILT: "TILT",
  DOLLY: "DOLLY",
  HANDHELD: "HANDHELD",
  STEADICAM: "STEADICAM",
  CRANE: "CRANE",
  DRONE: "DRONE",
  ZOOM: "ZOOM",
} as const;
export type CameraMovement =
  (typeof CameraMovements)[keyof typeof CameraMovements];

export const CameraLabels = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
} as const;
export type CameraLabel = (typeof CameraLabels)[keyof typeof CameraLabels];

export const TransitionTypes = {
  SETUP_CHANGE: "SETUP_CHANGE",
  MAKEUP_COSTUME: "MAKEUP_COSTUME",
  BREAK: "BREAK",
  TRAVEL: "TRAVEL",
} as const;
export type TransitionType =
  (typeof TransitionTypes)[keyof typeof TransitionTypes];

export const ShotEffortWeightsSchema = z.object({
  WS_STATIC: z.number().default(45),
  WS_DOLLY: z.number().default(90),
  WS_CRANE: z.number().default(120),
  MS_STATIC: z.number().default(25),
  MCU_STATIC: z.number().default(20),
  CU_STATIC: z.number().default(20),
  ECU_STATIC: z.number().default(15),
  OTS_STATIC: z.number().default(20),
  INSERT_STATIC: z.number().default(15),
  HANDHELD_ANY: z.number().default(15),
  STEADICAM_ANY: z.number().default(30),
  CRANE_ANY: z.number().default(120),
  DRONE_ANY: z.number().default(90),
  transition_rig_change: z.number().default(20),
  transition_shot_size_jump: z.number().default(15),
  transition_makeup: z.number().default(30),
  transition_costume: z.number().default(20),
});

export type ShotEffortWeights = z.infer<typeof ShotEffortWeightsSchema>;

export const DEFAULT_SHOT_EFFORT_WEIGHTS: ShotEffortWeights =
  ShotEffortWeightsSchema.parse({});

// Returns the lookup key for a shot (e.g. "WS_DOLLY", "HANDHELD_ANY")
export const shotWeightKey = (
  shotSize: ShotSize,
  cameraMovement: CameraMovement,
): keyof ShotEffortWeights => {
  const movementAnyKey = `${cameraMovement}_ANY` as keyof ShotEffortWeights;
  if (movementAnyKey in DEFAULT_SHOT_EFFORT_WEIGHTS) return movementAnyKey;
  return `${shotSize}_${cameraMovement}` as keyof ShotEffortWeights;
};
