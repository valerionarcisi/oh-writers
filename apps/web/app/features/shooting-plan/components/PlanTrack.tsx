import { SHOOTING_DAY_MINUTES } from "@oh-writers/domain";
import type {
  ShotView,
  TransitionSlotView,
  ScenarioView,
} from "../server/shooting-plan.server";
import { ShotBlock } from "./ShotBlock";
import { TransitionBlock } from "./TransitionBlock";
import styles from "./PlanTrack.module.css";

interface PlanTrackProps {
  scenario: ScenarioView;
  isActive: boolean;
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onContextMenuShot: (shotId: string, e: React.MouseEvent) => void;
  onMakeActive: () => void;
  onDragStart: (shotId: string, e: React.DragEvent) => void;
  onDragOverTrack: (e: React.DragEvent) => void;
  onDropOnTrack: (e: React.DragEvent) => void;
  dropIndicatorLeftPct: number | null;
  dropIndicatorIsSamePlan: boolean;
}

const widthPctForMinutes = (m: number): number =>
  Math.min((m / SHOOTING_DAY_MINUTES) * 100, 100);

const formatMin = (m: number): string =>
  m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

export function PlanTrack(props: PlanTrackProps) {
  const {
    scenario,
    isActive,
    selectedShotId,
    onSelectShot,
    onContextMenuShot,
    onMakeActive,
    onDragStart,
    onDragOverTrack,
    onDropOnTrack,
    dropIndicatorLeftPct,
    dropIndicatorIsSamePlan,
  } = props;

  const items: Array<
    | { kind: "shot"; shot: ShotView }
    | { kind: "transition"; transition: TransitionSlotView }
  > = [];
  const shotsSorted = [...scenario.shots].sort(
    (a, b) => a.position - b.position,
  );
  for (const shot of shotsSorted) {
    items.push({ kind: "shot", shot });
    const tr = scenario.transitions.find((t) => t.afterShotId === shot.id);
    if (tr) items.push({ kind: "transition", transition: tr });
  }

  const totalMinutes = scenario.totalMinutes;
  const overflowMinutes = Math.max(0, totalMinutes - SHOOTING_DAY_MINUTES);

  return (
    <div className={styles.track} data-active={isActive || undefined}>
      <div className={styles.label}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{scenario.name}</span>
          {isActive ? (
            <span className={styles.activeChip}>ATTIVO</span>
          ) : (
            <button
              type="button"
              className={styles.makeActiveBtn}
              onClick={onMakeActive}
            >
              RENDI ATTIVO
            </button>
          )}
          {scenario.isSuggested && (
            <span
              className={styles.suggestedChip}
              title="Pattern generato automaticamente — modifica per personalizzare"
            >
              suggerito
            </span>
          )}
        </div>
        <div className={styles.meta}>
          {formatMin(totalMinutes)} · {scenario.shots.length} shot
          {overflowMinutes > 0 && (
            <span className={styles.overflowBadge}>
              +{formatMin(overflowMinutes)} oltre giornata
            </span>
          )}
        </div>
      </div>

      <div
        className={styles.canvas}
        onDragOver={onDragOverTrack}
        onDrop={onDropOnTrack}
      >
        <div className={styles.blocks}>
          {items.map((it) => {
            if (it.kind === "shot") {
              const widthPct = widthPctForMinutes(it.shot.resolvedMinutes);
              return (
                <ShotBlock
                  key={it.shot.id}
                  shot={it.shot}
                  widthPct={widthPct}
                  isSelected={it.shot.id === selectedShotId}
                  onSelect={() => onSelectShot(it.shot.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onContextMenuShot(it.shot.id, e);
                  }}
                  onDragStart={(e) => onDragStart(it.shot.id, e)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDropOnTrack}
                />
              );
            }
            const widthPct = widthPctForMinutes(
              it.transition.estimatedMinutes ?? 0,
            );
            return (
              <TransitionBlock
                key={it.transition.id}
                transition={it.transition}
                widthPct={widthPct}
              />
            );
          })}
        </div>
        {dropIndicatorLeftPct !== null && (
          <div
            className={styles.dropIndicator}
            data-same={dropIndicatorIsSamePlan || undefined}
            style={{ insetInlineStart: `${dropIndicatorLeftPct}%` }}
          />
        )}
      </div>
    </div>
  );
}
