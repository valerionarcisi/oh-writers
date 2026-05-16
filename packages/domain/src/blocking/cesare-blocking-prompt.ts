import {
  ActorPositionsArraySchema,
  CameraPinsArraySchema,
  type ActorPosition,
  type CameraPin,
  type Primitive,
} from "./blocking.types";

export interface CesareBlockingInput {
  fountainText: string;
  sceneHeading: string;
  cast: Array<{ id: string; label: string }>;
  props: Array<{ id: string; label: string }>;
  shots: Array<{ id: string; shotSize: string; cameraMovement: string; cameraLabel: string }>;
  locationPrimitives: Primitive[];
  widthCm: number;
  heightCm: number;
  projectSuggestionHistory: { accepted: string[]; ignored: string[] };
}

export interface CesareBlockingOutput {
  actorPositions: ActorPosition[];
  cameraPins: CameraPin[];
}

export const buildCesareBlockingPrompt = (input: CesareBlockingInput): string => {
  const furniture = input.locationPrimitives
    .filter((p): p is Extract<Primitive, { type: "furniture" }> => p.type === "furniture")
    .map((p) => `  - "${p.label}" at x=${p.x},y=${p.y} size ${p.w}x${p.h}cm`)
    .join("\n") || "  (no furniture)";

  const shots = input.shots
    .map((s, i) => `  ${String.fromCharCode(65 + i)}. ${s.shotSize} ${s.cameraMovement} — "${s.cameraLabel}" (id:${s.id})`)
    .join("\n");

  return `You are a professional film assistant director. Place actors and cameras on a top-down floor plan.

SCENE: ${input.sceneHeading}
CANVAS: ${input.widthCm}cm × ${input.heightCm}cm

ACTION TEXT:
${input.fountainText}

CAST:
${input.cast.map((c) => `  - ${c.label} (castId: ${c.id})`).join("\n")}

SHOTS (active plan):
${shots}

FURNITURE:
${furniture}

HISTORY (do not repeat ignored patterns):
  Accepted: ${input.projectSuggestionHistory.accepted.slice(-5).join(", ") || "none"}
  Ignored:  ${input.projectSuggestionHistory.ignored.slice(-5).join(", ") || "none"}

PLACEMENT RULES:
- EWS/WS cameras: place far from subjects (>400cm from center), coneAngle 60-80
- MS/MCU/OTS cameras: medium distance (200-350cm), coneAngle 40-55
- CU/ECU cameras: close to named subject (100-200cm), coneAngle 20-35
- INSERT cameras: very close to prop (50-100cm), coneAngle 15-25
- coneDirection: degrees clockwise from up (0=up, 90=right, 180=down, 270=left)
- All x,y must be within 0–${input.widthCm} and 0–${input.heightCm}

Respond with ONLY valid JSON, no markdown:
{
  "actorPositions": [{ "castId": "<id>", "label": "<name>", "x": <n>, "y": <n>, "arrow": null }],
  "cameraPins": [{ "shotId": "<id>", "label": "<A · SHOTSIZE>", "x": <n>, "y": <n>, "coneAngle": <n>, "coneDirection": <n>, "movement": null }]
}`;
};

const safeDefaults = (input: CesareBlockingInput): CesareBlockingOutput => {
  const cx = input.widthCm / 2;
  const cy = input.heightCm / 2;
  const count = input.cast.length;
  return {
    actorPositions: input.cast.map((c, i) => ({
      castId: c.id,
      label: c.label,
      x: cx + (i - (count - 1) / 2) * 150,
      y: cy,
      arrow: null,
    })),
    cameraPins: input.shots.map((s, i) => ({
      shotId: s.id,
      label: `${String.fromCharCode(65 + i)} · ${s.shotSize}`,
      x: cx + (i - (input.shots.length - 1) / 2) * 200,
      y: cy + Math.min(300, input.heightCm * 0.3),
      coneAngle: 45,
      coneDirection: 0,
      movement: null,
    })),
  };
};

export const parseCesareBlockingResponse = (
  raw: string,
  fallbackInput: CesareBlockingInput,
): CesareBlockingOutput => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return safeDefaults(fallbackInput);
    const obj = parsed as Record<string, unknown>;
    const actors = ActorPositionsArraySchema.safeParse(obj["actorPositions"]);
    const cameras = CameraPinsArraySchema.safeParse(obj["cameraPins"]);
    if (actors.success && cameras.success) {
      return { actorPositions: actors.data, cameraPins: cameras.data };
    }
  } catch {
    // fall through to safe defaults — JSON.parse throws on invalid input
  }
  return safeDefaults(fallbackInput);
};
