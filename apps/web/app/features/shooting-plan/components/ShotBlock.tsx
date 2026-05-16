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

interface ShotBlockProps {
  shot: ShotView;
  widthPct: number;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function ShotBlock({
  shot,
  widthPct,
  isSelected,
  onSelect,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
}: ShotBlockProps) {
  const color = SHOT_SIZE_COLORS[shot.shotSize] ?? "var(--color-accent)";
  return (
    <div
      className={styles.block}
      data-testid="shot-block"
      style={
        {
          inlineSize: `${Math.max(widthPct, 1)}%`,
          "--shot-color": color,
        } as React.CSSProperties
      }
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-selected={isSelected || undefined}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={`${shot.shotSize} ${shot.cameraMovement} — ${shot.resolvedMinutes}m`}
    >
      <span className={styles.size}>{shot.shotSize}</span>
      <span className={styles.movement}>{shot.cameraMovement}</span>
      <span className={styles.duration}>{shot.resolvedMinutes}m</span>
    </div>
  );
}
