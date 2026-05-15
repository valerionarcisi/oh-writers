import { useMemo } from "react";
import { formatDayHours } from "@oh-writers/domain";
import type { ScheduleView, StripView } from "../server/schedule.server";
import styles from "./ScheduleTimelineView.module.css";

interface ScheduleTimelineViewProps {
  schedule: ScheduleView;
  onSelectDay: (dayId: string) => void;
}

const UNCATEGORIZED_KEY = "__none__";

interface BlockData {
  readonly dayId: string;
  readonly dayNumber: number;
  readonly sceneCount: number;
  readonly hours: number;
  readonly bannerColor: StripView["bannerColor"];
}

interface LaneData {
  readonly key: string;
  readonly label: string;
  readonly blocks: ReadonlyArray<BlockData | null>;
  readonly totalHours: number;
  readonly totalScenes: number;
}

const normalizeKey = (loc: string | null): string => {
  if (!loc) return UNCATEGORIZED_KEY;
  const t = loc.trim();
  return t.length === 0 ? UNCATEGORIZED_KEY : t.toUpperCase();
};

const prettyLabel = (key: string): string => {
  if (key === UNCATEGORIZED_KEY) return "Senza location";
  return key.toLowerCase();
};

export function ScheduleTimelineView({
  schedule,
  onSelectDay,
}: ScheduleTimelineViewProps) {
  const { lanes, dayCount } = useMemo(() => {
    const days = schedule.shootingDays;
    const laneMap = new Map<string, Map<string, BlockData>>();

    for (const day of days) {
      const byLoc = new Map<
        string,
        {
          sceneCount: number;
          hours: number;
          bannerColor: StripView["bannerColor"];
        }
      >();
      for (const strip of day.strips) {
        const key = normalizeKey(strip.location);
        const cur = byLoc.get(key) ?? {
          sceneCount: 0,
          hours: 0,
          bannerColor: strip.bannerColor,
        };
        cur.sceneCount += 1;
        cur.hours += strip.resolvedHours;
        byLoc.set(key, cur);
      }
      for (const [key, agg] of byLoc) {
        const laneBlocks = laneMap.get(key) ?? new Map<string, BlockData>();
        laneBlocks.set(day.id, {
          dayId: day.id,
          dayNumber: day.dayNumber,
          sceneCount: agg.sceneCount,
          hours: agg.hours,
          bannerColor: agg.bannerColor,
        });
        laneMap.set(key, laneBlocks);
      }
    }

    const orderedLanes: LaneData[] = [];
    const entries = [...laneMap.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED_KEY) return 1;
      if (b === UNCATEGORIZED_KEY) return -1;
      return a.localeCompare(b);
    });

    for (const [key, blockMap] of entries) {
      const blocks = days.map((d) => blockMap.get(d.id) ?? null);
      const totalScenes = blocks.reduce(
        (s, b) => s + (b?.sceneCount ?? 0),
        0,
      );
      const totalHours = blocks.reduce((s, b) => s + (b?.hours ?? 0), 0);
      orderedLanes.push({
        key,
        label: prettyLabel(key),
        blocks,
        totalScenes,
        totalHours,
      });
    }

    return { lanes: orderedLanes, dayCount: days.length };
  }, [schedule]);

  if (dayCount === 0) {
    return (
      <p className={styles.placeholder}>
        Nessuna giornata pianificata. Genera prima il piano di lavorazione.
      </p>
    );
  }

  return (
    <div className={styles.wrap} data-testid="schedule-timeline-view">
      <div
        className={styles.grid}
        style={{ "--day-count": dayCount } as React.CSSProperties}
      >
        <div className={styles.laneHead} aria-hidden="true">
          Location
        </div>
        <div className={styles.axis}>
          {schedule.shootingDays.map((d) => (
            <button
              key={d.id}
              type="button"
              className={styles.axisCell}
              onClick={() => onSelectDay(d.id)}
              aria-label={`Giornata ${d.dayNumber}`}
              data-testid={`timeline-axis-${d.dayNumber}`}
            >
              <span className={styles.axisLabel}>Giorno</span>
              <span className={styles.axisNum}>
                {String(d.dayNumber).padStart(2, "0")}
              </span>
            </button>
          ))}
        </div>

        {lanes.map((lane) => (
          <div
            key={lane.key}
            className={`${styles.lane} ${lane.key === UNCATEGORIZED_KEY ? styles.laneNone : ""}`}
          >
            <div className={styles.laneLabelCol}>
              <div className={styles.laneLabel}>{lane.label}</div>
              <div className={styles.laneMeta}>
                {lane.totalScenes} sc · {formatDayHours(lane.totalHours)}
              </div>
            </div>
            <div className={styles.row}>
              {lane.blocks.map((b, i) =>
                b ? (
                  <button
                    key={`${lane.key}-${b.dayId}`}
                    type="button"
                    className={styles.block}
                    data-color={b.bannerColor}
                    onClick={() => onSelectDay(b.dayId)}
                    title={`G${String(b.dayNumber).padStart(2, "0")} · ${b.sceneCount} scene · ${formatDayHours(b.hours)}`}
                    data-testid={`timeline-block-${lane.key}-${b.dayNumber}`}
                  >
                    <span className={styles.blockNum}>
                      {b.sceneCount} sc
                    </span>
                    <span className={styles.blockHours}>
                      {formatDayHours(b.hours)}
                    </span>
                  </button>
                ) : (
                  <span
                    key={`empty-${lane.key}-${i}`}
                    className={styles.blockEmpty}
                    aria-hidden="true"
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
