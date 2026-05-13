import type {
  ShotEffortWeights,
  ShotSize,
  CameraMovement,
  TransitionType,
} from "./effort-weights.js";
import { SHOT_SIZE_ORDER } from "./effort-weights.js";

type ShotInput = {
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  estimatedMinutes: number | null;
};

export type ShotForTransition = {
  id: string;
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
};

export type InferredTransition = {
  afterShotId: string;
  type: TransitionType;
  estimatedMinutes: number;
  ruleId: string;
  label: string;
};

export const resolveShotMinutes = (
  shot: ShotInput,
  weights: ShotEffortWeights,
): number => {
  if (shot.estimatedMinutes !== null) return shot.estimatedMinutes;
  const movementAnyKey =
    `${shot.cameraMovement}_ANY` as keyof ShotEffortWeights;
  if (movementAnyKey in weights) return weights[movementAnyKey] as number;
  const key =
    `${shot.shotSize}_${shot.cameraMovement}` as keyof ShotEffortWeights;
  return (weights[key] as number | undefined) ?? weights.MS_STATIC;
};

const HEAVY_MOVEMENTS = new Set(["DOLLY", "CRANE"]);
const LIGHT_MOVEMENTS = new Set(["HANDHELD", "STEADICAM"]);

export const inferTransitions = (
  shotA: ShotForTransition,
  shotB: ShotForTransition,
  breakdownCategories: string[],
  weights: ShotEffortWeights,
): InferredTransition[] => {
  const transitions: InferredTransition[] = [];

  const aIsHeavy = HEAVY_MOVEMENTS.has(shotA.cameraMovement);
  const aIsLight = LIGHT_MOVEMENTS.has(shotA.cameraMovement);
  const bIsHeavy = HEAVY_MOVEMENTS.has(shotB.cameraMovement);
  const bIsLight = LIGHT_MOVEMENTS.has(shotB.cameraMovement);
  if ((aIsHeavy && bIsLight) || (aIsLight && bIsHeavy)) {
    transitions.push({
      afterShotId: shotA.id,
      type: "SETUP_CHANGE",
      estimatedMinutes: weights.transition_rig_change,
      ruleId: "rig_change",
      label: `Rig change: ${shotA.cameraMovement} → ${shotB.cameraMovement}`,
    });
  }

  const orderA = SHOT_SIZE_ORDER[shotA.shotSize];
  const orderB = SHOT_SIZE_ORDER[shotB.shotSize];
  if (
    orderA !== undefined &&
    orderB !== undefined &&
    Math.abs(orderA - orderB) > 2
  ) {
    transitions.push({
      afterShotId: shotA.id,
      type: "SETUP_CHANGE",
      estimatedMinutes: weights.transition_shot_size_jump,
      ruleId: "shot_size_jump",
      label: `Size jump: ${shotA.shotSize} → ${shotB.shotSize}`,
    });
  }

  if (breakdownCategories.some((c) => c === "makeup" || c === "hair")) {
    transitions.push({
      afterShotId: shotA.id,
      type: "MAKEUP_COSTUME",
      estimatedMinutes: weights.transition_makeup,
      ruleId: "makeup",
      label: "Makeup/hair change",
    });
  }

  if (breakdownCategories.includes("costume")) {
    transitions.push({
      afterShotId: shotA.id,
      type: "MAKEUP_COSTUME",
      estimatedMinutes: weights.transition_costume,
      ruleId: "costume",
      label: "Costume change",
    });
  }

  return transitions;
};
