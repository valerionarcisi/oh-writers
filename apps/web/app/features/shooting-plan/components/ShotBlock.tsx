import { useRef, useState, useCallback } from "react";
import { SHOOTING_DAY_MINUTES, SHOT_SIZE_LABELS } from "@oh-writers/domain";
import type { ShotView } from "../server/shooting-plan.server";
import styles from "./ShotBlock.module.css";

const SHOT_SIZE_COLORS: Record<string, string> = {
  EWS: "var(--ds-plan-2)",
  WS: "var(--ds-plan-2)",
  MS: "var(--ds-plan-1)",
  MCU: "var(--ds-plan-1)",
  OTS: "var(--ds-plan-1)",
  TWO_SHOT: "var(--ds-plan-1)",
  CU: "var(--ds-plan-3)",
  ECU: "var(--ds-plan-3)",
  INSERT: "var(--ds-cat-locations)",
  POV: "var(--ds-cat-cast)",
};

const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

interface ShotBlockProps {
  shot: ShotView;
  widthPct: number;
  getTrackWidth: () => number;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onResizeCommit: (shotId: string, minutes: number) => void;
}

export function ShotBlock({
  shot,
  widthPct,
  getTrackWidth,
  isSelected,
  onSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onResizeCommit,
}: ShotBlockProps) {
  const color = SHOT_SIZE_COLORS[shot.shotSize] ?? "var(--color-accent)";
  const [resizeMinutes, setResizeMinutes] = useState<number | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startMinutes: number;
    trackWidth: number;
  } | null>(null);

  const displayMinutes = resizeMinutes ?? shot.resolvedMinutes;
  const displayWidthPct =
    resizeMinutes !== null
      ? Math.min((resizeMinutes / SHOOTING_DAY_MINUTES) * 100, 100)
      : widthPct;

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      resizeRef.current = {
        startX: e.clientX,
        startMinutes: shot.resolvedMinutes,
        trackWidth: getTrackWidth(),
      };
    },
    [shot.resolvedMinutes, getTrackWidth],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeRef.current || resizeRef.current.trackWidth <= 0) return;
      const deltaX = e.clientX - resizeRef.current.startX;
      const deltaMinutes =
        (deltaX / resizeRef.current.trackWidth) * SHOOTING_DAY_MINUTES;
      const next = Math.round(resizeRef.current.startMinutes + deltaMinutes);
      setResizeMinutes(Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, next)));
    },
    [],
  );

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeRef.current) return;
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      if (resizeMinutes !== null) {
        onResizeCommit(shot.id, resizeMinutes);
      }
      setResizeMinutes(null);
      resizeRef.current = null;
    },
    [resizeMinutes, shot.id, onResizeCommit],
  );

  return (
    <div
      className={styles.block}
      data-testid="shot-block"
      data-resizing={resizeMinutes !== null || undefined}
      style={
        {
          inlineSize: `${Math.max(displayWidthPct, 1)}%`,
          "--shot-color": color,
        } as React.CSSProperties
      }
      draggable={resizeMinutes === null}
      onDragStart={resizeMinutes === null ? onDragStart : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-selected={isSelected || undefined}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={`${SHOT_SIZE_LABELS[shot.shotSize] ?? shot.shotSize} · ${shot.cameraMovement} · ${displayMinutes}m`}
    >
      <span className={styles.size} title={SHOT_SIZE_LABELS[shot.shotSize]}>{shot.shotSize}</span>
      <span className={styles.movement}>{shot.cameraMovement}</span>
      <span className={styles.duration}>{displayMinutes}m</span>
      <div
        className={styles.resizeHandle}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        title="Trascina per cambiare durata"
      />
    </div>
  );
}
