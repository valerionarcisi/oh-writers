import { useRef, useCallback } from "react";
import { SHOOTING_DAY_MINUTES } from "@oh-writers/domain";
import type {
  ShotView,
  TransitionSlotView,
  ScenarioView,
} from "../server/shooting-plan.server";
import { ShotBlock } from "./ShotBlock";
import { TransitionBlock } from "./TransitionBlock";
import { useTranslation } from "~/features/i18n";
import styles from "./PlanTrack.module.css";

interface PlanTrackProps {
  scenario: ScenarioView;
  isActive: boolean;
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onContextMenuShot: (shotId: string, e: React.MouseEvent) => void;
  onContextMenuTrack: (scenarioId: string, e: React.MouseEvent) => void;
  onMakeActive: () => void;
  onDragStart: (shotId: string, e: React.DragEvent) => void;
  onDragOverTrack: (e: React.DragEvent) => void;
  onDropOnTrack: (e: React.DragEvent, trackEl: HTMLElement) => void;
  dropIndicatorLeftPct: number | null;
  dropIndicatorIsSamePlan: boolean;
  onResizeCommit: (shotId: string, minutes: number) => void;
}

const widthPctForMinutes = (m: number): number =>
  Math.min((m / SHOOTING_DAY_MINUTES) * 100, 100);

const formatMin = (m: number): string =>
  m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

// True when any shot in the scenario has an explicit time anchor.
const hasAnyTimeOffset = (scenario: ScenarioView): boolean =>
  scenario.shots.some((s) => s.timeOffset !== null);

export function PlanTrack(props: PlanTrackProps) {
  const {
    scenario,
    isActive,
    selectedShotId,
    onSelectShot,
    onContextMenuShot,
    onContextMenuTrack,
    onMakeActive,
    onDragStart,
    onDragOverTrack,
    onDropOnTrack,
    dropIndicatorLeftPct,
    dropIndicatorIsSamePlan,
    onResizeCommit,
  } = props;

  const { t } = useTranslation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const getTrackWidth = useCallback(
    () => canvasRef.current?.getBoundingClientRect().width ?? 0,
    [],
  );

  const shotsSorted = [...scenario.shots].sort(
    (a, b) => a.position - b.position,
  );

  // When any shot has a timeOffset, render all shots absolutely positioned.
  // Shots without an explicit offset fall back to packed position based on order.
  const useAbsoluteLayout = hasAnyTimeOffset(scenario);

  const items: Array<
    | { kind: "shot"; shot: ShotView; leftPct: number | null }
    | { kind: "transition"; transition: TransitionSlotView }
  > = [];

  if (useAbsoluteLayout) {
    // Compute packed offset for shots that have no explicit timeOffset.
    let runningMinutes = 0;
    for (const shot of shotsSorted) {
      const leftMinutes = shot.timeOffset ?? runningMinutes;
      const leftPct = Math.min((leftMinutes / SHOOTING_DAY_MINUTES) * 100, 99);
      items.push({ kind: "shot", shot, leftPct });
      runningMinutes = leftMinutes + shot.resolvedMinutes;
      const tr = scenario.transitions.find((t) => t.afterShotId === shot.id);
      if (tr) items.push({ kind: "transition", transition: tr });
    }
  } else {
    for (const shot of shotsSorted) {
      items.push({ kind: "shot", shot, leftPct: null });
      const tr = scenario.transitions.find((t) => t.afterShotId === shot.id);
      if (tr) items.push({ kind: "transition", transition: tr });
    }
  }

  const totalMinutes = scenario.totalMinutes;
  const overflowMinutes = Math.max(0, totalMinutes - SHOOTING_DAY_MINUTES);

  const planAccentIndex = Math.min((scenario.position ?? 0) + 1, 3);
  const planAccent = `var(--ds-plan-${planAccentIndex})`;

  return (
    <div
      className={styles.track}
      data-active={isActive || undefined}
      style={{ "--plan-accent": planAccent } as React.CSSProperties}
    >
      <div className={styles.label}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{scenario.name}</span>
          {isActive ? (
            <span className={styles.activeChip}>
              {t("shootingPlan.track.active")}
            </span>
          ) : (
            <button
              type="button"
              className={styles.makeActiveBtn}
              onClick={onMakeActive}
            >
              {t("shootingPlan.track.makeActive")}
            </button>
          )}
          {scenario.isSuggested && (
            <span
              className={styles.suggestedChip}
              title={t("shootingPlan.track.suggestedTitle")}
            >
              {t("shootingPlan.track.suggested")}
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
        ref={canvasRef}
        className={styles.canvas}
        data-absolute-layout={useAbsoluteLayout || undefined}
        onDragOver={onDragOverTrack}
        onDrop={(e) => onDropOnTrack(e, canvasRef.current!)}
        onContextMenu={(e) => {
          // Only trigger track context menu when clicking on the canvas itself,
          // not on a shot block (shot blocks call e.preventDefault() on their own).
          if (e.defaultPrevented) return;
          e.preventDefault();
          onContextMenuTrack(scenario.id, e);
        }}
      >
        <div
          className={styles.blocks}
          data-absolute-layout={useAbsoluteLayout || undefined}
        >
          {items.map((it) => {
            if (it.kind === "shot") {
              const widthPct = widthPctForMinutes(it.shot.resolvedMinutes);
              return (
                <ShotBlock
                  key={it.shot.id}
                  shot={it.shot}
                  widthPct={widthPct}
                  leftPct={it.leftPct}
                  getTrackWidth={getTrackWidth}
                  isSelected={it.shot.id === selectedShotId}
                  onSelect={() => onSelectShot(it.shot.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onContextMenuShot(it.shot.id, e);
                  }}
                  onDragStart={(e) => onDragStart(it.shot.id, e)}
                  onResizeCommit={onResizeCommit}
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
