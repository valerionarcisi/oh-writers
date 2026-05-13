import type { ShotView } from "../server/shooting-plan.server";
import styles from "./ShotBlock.module.css";

const SHOT_SIZE_COLORS: Record<string, string> = {
  EWS: "var(--color-accent-green)",
  WS: "var(--color-accent-green)",
  MS: "var(--color-accent-blue)",
  MCU: "var(--color-accent-blue)",
  OTS: "var(--color-accent-blue)",
  TWO_SHOT: "var(--color-accent-blue)",
  CU: "var(--color-accent-red)",
  ECU: "var(--color-accent-red)",
  INSERT: "var(--color-accent-orange)",
  POV: "var(--color-accent-purple)",
};

interface ShotBlockProps {
  shot: ShotView;
  totalMinutes: number;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function ShotBlock({
  shot,
  totalMinutes,
  isSelected,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: ShotBlockProps) {
  const widthPct =
    totalMinutes > 0 ? (shot.resolvedMinutes / totalMinutes) * 100 : 10;
  const color = SHOT_SIZE_COLORS[shot.shotSize] ?? "var(--color-accent)";
  return (
    <div
      className={styles.block}
      style={{
        inlineSize: `${Math.max(widthPct, 4)}%`,
        borderInlineStartColor: color,
      }}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-selected={isSelected || undefined}
      onClick={onSelect}
      title={`${shot.shotSize} ${shot.cameraMovement} — ${shot.resolvedMinutes}m`}
    >
      <span className={styles.size}>{shot.shotSize}</span>
      <span className={styles.movement}>{shot.cameraMovement}</span>
      <span className={styles.duration}>{shot.resolvedMinutes}m</span>
    </div>
  );
}
