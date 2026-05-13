import type {
  ShootingDayView,
  StripView,
} from "~/features/schedule/server/schedule.server";
import styles from "./DayBalanceTimeline.module.css";

const MAX_HOURS = 8;

interface DayBalanceTimelineProps {
  day: ShootingDayView;
  projectId: string;
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
}

export function DayBalanceTimeline({
  day,
  selectedSceneId,
  onSelectScene,
}: DayBalanceTimelineProps) {
  const totalHours = day.totalHours;
  const isOverCapacity = totalHours > MAX_HOURS;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>
          GG {day.dayNumber} — bilanciamento giorno
        </span>
        <span className={styles.total} data-over={isOverCapacity || undefined}>
          {totalHours.toFixed(1)}h / {MAX_HOURS}h
        </span>
      </div>
      <div className={styles.bars}>
        {day.strips.map((strip) => (
          <SceneBar
            key={strip.id}
            strip={strip}
            isSelected={strip.sceneId === selectedSceneId}
            onSelect={() => onSelectScene(strip.sceneId)}
          />
        ))}
      </div>
      <div className={styles.ruler}>
        {[0, 2, 4, 6, 8].map((h) => (
          <span key={h} style={{ inlineSize: `${(h / MAX_HOURS) * 100}%` }}>
            {h}h
          </span>
        ))}
      </div>
    </div>
  );
}

function SceneBar({
  strip,
  isSelected,
  onSelect,
}: {
  strip: StripView;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const pct = Math.min((strip.resolvedHours / MAX_HOURS) * 100, 100);
  const hasShots = strip.resolvedHours > 0;
  return (
    <button
      type="button"
      className={styles.sceneRow}
      data-selected={isSelected || undefined}
      onClick={onSelect}
    >
      <span className={styles.sceneName}>
        SC.{strip.sceneNumber} {strip.location}
      </span>
      <span className={styles.barTrack}>
        <span
          className={styles.barFill}
          style={{ inlineSize: `${pct}%` }}
          data-empty={!hasShots || undefined}
        />
        {hasShots && (
          <span className={styles.barLabel}>
            {(strip.resolvedHours * 60).toFixed(0)}m
          </span>
        )}
      </span>
    </button>
  );
}
