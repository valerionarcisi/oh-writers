import { useRef, useState, useCallback, useEffect } from "react";
import type { Primitive, ActorPosition, CameraPin } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { ActorPin, CameraPinEl } from "./BlockingPin";
import styles from "./BlockingCanvas.module.css";

const DISPLAY_W = 680;

export interface ProposedActorChange {
  readonly kind: "actor";
  readonly castId: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export interface ProposedCameraChange {
  readonly kind: "camera";
  readonly shotId: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly coneDirection: number;
  readonly coneAngle: number;
}

export type ProposedBlockingChange = ProposedActorChange | ProposedCameraChange;

interface BlockingCanvasProps {
  primitives: Primitive[];
  actorPositions: ActorPosition[];
  cameraPins: CameraPin[];
  widthCm: number;
  heightCm: number;
  isSuggested?: boolean;
  readOnly?: boolean;
  selectedShotId?: string | null;
  proposedChanges?: ReadonlyArray<ProposedBlockingChange> | null;
  onActorMove?: (castId: string, x: number, y: number) => void;
  onCameraMove?: (shotId: string, x: number, y: number) => void;
  onCameraRotate?: (shotId: string, coneDirection: number) => void;
  onPinClick?: (shotId: string) => void;
}

export function BlockingCanvas({
  primitives,
  actorPositions,
  cameraPins,
  widthCm,
  heightCm,
  readOnly = false,
  selectedShotId,
  proposedChanges,
  onActorMove,
  onCameraMove,
  onCameraRotate,
  onPinClick,
}: BlockingCanvasProps) {
  const { t } = useTranslation();
  const scale = DISPLAY_W / widthCm;
  const displayH = heightCm * scale;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<
    | {
        kind: "actor" | "camera";
        id: string;
        origX: number;
        origY: number;
      }
    | {
        kind: "rotate";
        id: string;
        origDirection: number;
      }
    | null
  >(null);

  const [localActors, setLocalActors] =
    useState<ActorPosition[]>(actorPositions);
  const [localCameras, setLocalCameras] = useState<CameraPin[]>(cameraPins);

  // Sync external prop changes when no drag is in progress
  useEffect(() => {
    if (!dragging.current) setLocalActors(actorPositions);
  }, [actorPositions]);

  useEffect(() => {
    if (!dragging.current) setLocalCameras(cameraPins);
  }, [cameraPins]);

  const toCanvasCm = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: Math.round((clientX - rect.left) / scale),
        y: Math.round((clientY - rect.top) / scale),
      };
    },
    [scale],
  );

  const handlePointerDown = useCallback(
    (kind: "actor" | "camera", id: string, origX: number, origY: number) =>
      (e: React.PointerEvent) => {
        if (readOnly) return;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        dragging.current = { kind, id, origX, origY };
      },
    [readOnly],
  );

  const handleRotateDown = useCallback(
    (shotId: string, origDirection: number) => (e: React.PointerEvent) => {
      if (readOnly) return;
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragging.current = { kind: "rotate", id: shotId, origDirection };
    },
    [readOnly],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragging.current;
      if (!d) return;
      if (d.kind === "rotate") {
        const pin = localCameras.find((c) => c.shotId === d.id);
        if (!pin) return;
        const { x, y } = toCanvasCm(e.clientX, e.clientY);
        const dx = x - pin.x;
        const dy = y - pin.y;
        // Convert atan2 (math angle, 0 = right, ccw) to our coneDirection
        // (0 = up, cw). atan2(dy,dx) returns angle from +X axis cw in screen coords.
        let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (deg < 0) deg += 360;
        if (deg >= 360) deg -= 360;
        const rounded = Math.round(deg);
        setLocalCameras((prev) =>
          prev.map((c) =>
            c.shotId === d.id ? { ...c, coneDirection: rounded } : c,
          ),
        );
        return;
      }
      const { x, y } = toCanvasCm(e.clientX, e.clientY);
      const clamped = {
        x: Math.max(0, Math.min(widthCm, x)),
        y: Math.max(0, Math.min(heightCm, y)),
      };
      if (d.kind === "actor") {
        setLocalActors((prev) =>
          prev.map((a) =>
            a.castId === d.id ? { ...a, x: clamped.x, y: clamped.y } : a,
          ),
        );
      } else {
        setLocalCameras((prev) =>
          prev.map((c) =>
            c.shotId === d.id ? { ...c, x: clamped.x, y: clamped.y } : c,
          ),
        );
      }
    },
    [toCanvasCm, widthCm, heightCm, localCameras],
  );

  const handlePointerUp = useCallback(() => {
    const d = dragging.current;
    if (!d) return;
    if (d.kind === "rotate") {
      const cam = localCameras.find((c) => c.shotId === d.id);
      if (cam && cam.coneDirection !== d.origDirection) {
        onCameraRotate?.(d.id, cam.coneDirection);
      }
    } else if (d.kind === "actor") {
      const actor = localActors.find((a) => a.castId === d.id);
      if (actor && (actor.x !== d.origX || actor.y !== d.origY)) {
        onActorMove?.(d.id, actor.x, actor.y);
      }
    } else {
      const cam = localCameras.find((c) => c.shotId === d.id);
      if (cam && (cam.x !== d.origX || cam.y !== d.origY)) {
        onCameraMove?.(d.id, cam.x, cam.y);
      }
    }
    dragging.current = null;
  }, [localActors, localCameras, onActorMove, onCameraMove, onCameraRotate]);

  return (
    <svg
      ref={svgRef}
      className={styles.canvas}
      viewBox={`0 0 ${DISPLAY_W} ${displayH}`}
      width={DISPLAY_W}
      height={displayH}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <defs>
        <marker
          id="arrowhead-actor"
          markerWidth="6"
          markerHeight="6"
          refX="3"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-accent-green)" />
        </marker>
        <marker
          id="arrowhead-camera"
          markerWidth="6"
          markerHeight="6"
          refX="3"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-accent-red)" />
        </marker>
      </defs>

      {primitives.map((p, i) => {
        if (p.type === "wall") {
          return (
            <rect
              key={`p${i}`}
              x={p.x * scale}
              y={p.y * scale}
              width={p.w * scale}
              height={p.h * scale}
              fill="var(--color-text-muted)"
              opacity={0.6}
            />
          );
        }
        if (p.type === "furniture") {
          return (
            <g key={`p${i}`}>
              <rect
                x={p.x * scale}
                y={p.y * scale}
                width={p.w * scale}
                height={p.h * scale}
                fill="var(--color-surface)"
                stroke="var(--color-border-strong)"
                strokeWidth={1 * scale}
                rx={2 * scale}
              />
              <text
                x={(p.x + p.w / 2) * scale}
                y={(p.y + p.h / 2) * scale + 4 * scale}
                textAnchor="middle"
                fontSize={Math.max(7, 9 * scale)}
                fill="var(--color-text-muted)"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {p.label}
              </text>
            </g>
          );
        }
        if (p.type === "opening") {
          return (
            <g key={`p${i}`}>
              <rect
                x={p.x * scale}
                y={p.y * scale}
                width={p.w * scale}
                height={p.h * scale}
                fill="var(--color-bg)"
                stroke="var(--color-accent)"
                strokeWidth={1.5 * scale}
              />
              <text
                x={(p.x + p.w / 2) * scale}
                y={(p.y + p.h / 2) * scale + 4 * scale}
                textAnchor="middle"
                fontSize={Math.max(6, 7 * scale)}
                fill="var(--color-accent)"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {p.kind === "door" ? "▭" : "═"}
              </text>
            </g>
          );
        }
        return null;
      })}

      {localActors.map((actor) => (
        <ActorPin
          key={actor.castId}
          actor={actor}
          scale={scale}
          isReadOnly={readOnly}
          onPointerDown={handlePointerDown(
            "actor",
            actor.castId,
            actor.x,
            actor.y,
          )}
        />
      ))}

      {localCameras.map((pin) => (
        <CameraPinEl
          key={pin.shotId}
          pin={pin}
          scale={scale}
          isReadOnly={readOnly}
          isSelected={pin.shotId === selectedShotId}
          onPointerDown={handlePointerDown("camera", pin.shotId, pin.x, pin.y)}
          onRotateHandleDown={handleRotateDown(pin.shotId, pin.coneDirection)}
          onClick={() => onPinClick?.(pin.shotId)}
        />
      ))}

      {proposedChanges && proposedChanges.length > 0 && (
        <g
          className={styles.ghostLayer}
          aria-label={t("shootingPlan.canvas.proposalsAria")}
        >
          {proposedChanges.map((p) => {
            if (p.kind === "actor") {
              const r = 14 * scale;
              return (
                <g key={`gh-actor-${p.castId}`} className={styles.ghostActor}>
                  <circle
                    cx={p.x * scale}
                    cy={p.y * scale}
                    r={r}
                    fill="var(--color-accent-green)"
                    fillOpacity={0.25}
                    stroke="var(--color-accent-green)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={p.x * scale}
                    y={p.y * scale + 4}
                    textAnchor="middle"
                    fontSize={Math.max(8, 11 * scale)}
                    fill="var(--color-accent-green)"
                    fontWeight={700}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {p.label.slice(0, 2).toUpperCase()}
                  </text>
                </g>
              );
            }
            // Camera ghost: dashed triangle outline + label
            const boxW = 36 * scale;
            const boxH = 24 * scale;
            return (
              <g key={`gh-cam-${p.shotId}`} className={styles.ghostCamera}>
                <rect
                  x={p.x * scale - boxW / 2}
                  y={p.y * scale - boxH / 2}
                  width={boxW}
                  height={boxH}
                  rx={3 * scale}
                  fill="var(--color-accent-red)"
                  fillOpacity={0.18}
                  stroke="var(--color-accent-red)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                <text
                  x={p.x * scale}
                  y={p.y * scale + 4}
                  textAnchor="middle"
                  fontSize={Math.max(7, 9 * scale)}
                  fill="var(--color-accent-red)"
                  fontWeight={700}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {p.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
