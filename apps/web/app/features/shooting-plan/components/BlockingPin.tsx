import type { ActorPosition, CameraPin } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";

export const CONE_RADIUS = 80;

function conePathD(
  cx: number,
  cy: number,
  angle: number,
  direction: number,
  scale: number,
): string {
  const r = CONE_RADIUS * scale;
  const halfAngle = (angle / 2) * (Math.PI / 180);
  const dir = (direction - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(dir - halfAngle);
  const y1 = cy + r * Math.sin(dir - halfAngle);
  const x2 = cx + r * Math.cos(dir + halfAngle);
  const y2 = cy + r * Math.sin(dir + halfAngle);
  return `M${cx},${cy} L${x1},${y1} A${r},${r},0,0,1,${x2},${y2} Z`;
}

interface ActorPinProps {
  actor: ActorPosition;
  scale: number;
  isReadOnly?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function ActorPin({
  actor,
  scale,
  isReadOnly,
  onPointerDown,
}: ActorPinProps) {
  const r = 14 * scale;
  const fs = Math.max(8, 11 * scale);
  return (
    <g
      style={{ cursor: isReadOnly ? "default" : "grab" }}
      onPointerDown={isReadOnly ? undefined : onPointerDown}
    >
      {actor.arrow && (
        <line
          x1={actor.x * scale}
          y1={actor.y * scale}
          x2={actor.arrow.toX * scale}
          y2={actor.arrow.toY * scale}
          stroke="var(--color-accent-green)"
          strokeWidth={1.5 * scale}
          strokeDasharray={`${4 * scale},${3 * scale}`}
          markerEnd="url(#arrowhead-actor)"
        />
      )}
      <circle
        cx={actor.x * scale}
        cy={actor.y * scale}
        r={r}
        fill="var(--color-accent-green)"
        opacity={0.9}
      />
      <text
        x={actor.x * scale}
        y={actor.y * scale + fs * 0.35}
        textAnchor="middle"
        fontSize={fs}
        fill="white"
        fontWeight={700}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {actor.label.slice(0, 2).toUpperCase()}
      </text>
      <text
        x={actor.x * scale}
        y={actor.y * scale + r + fs + 2 * scale}
        textAnchor="middle"
        fontSize={Math.max(7, 9 * scale)}
        fill="var(--color-text-muted)"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {actor.label}
      </text>
    </g>
  );
}

interface CameraPinElProps {
  pin: CameraPin;
  scale: number;
  isReadOnly?: boolean;
  isSelected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onRotateHandleDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
}

export function CameraPinEl({
  pin,
  scale,
  isReadOnly,
  isSelected,
  onPointerDown,
  onRotateHandleDown,
  onClick,
}: CameraPinElProps) {
  const { t } = useTranslation();
  const fs = Math.max(7, 9 * scale);
  const boxW = 36 * scale;
  const boxH = 24 * scale;
  // Position of the rotation handle: at the tip of the cone direction
  const handleR = CONE_RADIUS * scale;
  const dir = (pin.coneDirection - 90) * (Math.PI / 180);
  const handleX = pin.x * scale + handleR * Math.cos(dir);
  const handleY = pin.y * scale + handleR * Math.sin(dir);
  return (
    <g>
      <path
        d={conePathD(
          pin.x * scale,
          pin.y * scale,
          pin.coneAngle,
          pin.coneDirection,
          scale,
        )}
        fill="var(--color-accent-red)"
        opacity={0.2}
        style={{ pointerEvents: "none" }}
      />
      {pin.movement && (
        <line
          x1={pin.x * scale}
          y1={pin.y * scale}
          x2={pin.movement.toX * scale}
          y2={pin.movement.toY * scale}
          stroke="var(--color-accent-red)"
          strokeWidth={1.5 * scale}
          strokeDasharray={`${4 * scale},${3 * scale}`}
          markerEnd="url(#arrowhead-camera)"
        />
      )}
      <g
        style={{ cursor: isReadOnly ? "default" : "grab" }}
        onPointerDown={isReadOnly ? undefined : onPointerDown}
        onClick={onClick}
      >
        <rect
          x={pin.x * scale - boxW / 2}
          y={pin.y * scale - boxH / 2}
          width={boxW}
          height={boxH}
          rx={3 * scale}
          fill={isSelected ? "var(--color-accent)" : "var(--color-accent-red)"}
          stroke={isSelected ? "var(--color-accent-border)" : "none"}
          strokeWidth={2 * scale}
        />
        <text
          x={pin.x * scale}
          y={pin.y * scale + fs * 0.35}
          textAnchor="middle"
          fontSize={fs}
          fill="white"
          fontWeight={700}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {pin.label}
        </text>
      </g>
      {!isReadOnly && (
        <circle
          cx={handleX}
          cy={handleY}
          r={6 * scale}
          fill="var(--color-accent-red)"
          stroke="white"
          strokeWidth={1.5 * scale}
          opacity={0.95}
          style={{ cursor: "grab" }}
          onPointerDown={onRotateHandleDown}
        >
          <title>{t("shootingPlan.pin.rotateTitle")}</title>
        </circle>
      )}
    </g>
  );
}
