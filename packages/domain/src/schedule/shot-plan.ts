import type {
  ShotEffortWeights,
  ShotSize,
  CameraMovement,
} from "./effort-weights.js";

type ShotInput = {
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  estimatedMinutes: number | null;
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
