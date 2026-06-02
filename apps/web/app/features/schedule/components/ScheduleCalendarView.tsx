import { useMemo } from "react";
import { computeDayKpis, formatDayHours } from "@oh-writers/domain";
import type { ScheduleView, ShootingDayView } from "../server/schedule.server";
import { useTranslation } from "~/features/i18n";
import styles from "./ScheduleCalendarView.module.css";

interface ScheduleCalendarViewProps {
  schedule: ScheduleView;
  onSelectDay: (dayId: string) => void;
}

const WEEKDAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const ITALIAN_MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const HEAVY_THRESHOLD = 10;
const LIGHT_THRESHOLD = 4;

interface DayCell {
  readonly day: ShootingDayView;
  readonly hours: number;
  readonly primaryLocation: string | null;
}

interface CalendarWeek {
  readonly id: string;
  readonly label: string;
  readonly cells: ReadonlyArray<DayCell | null>;
}

const parseIsoDate = (iso: string): Date | null => {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};

const isoWeekKey = (date: Date): string => {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((tmp.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const mondayOf = (date: Date): Date => {
  const out = new Date(date);
  const dayNum = (out.getUTCDay() + 6) % 7;
  out.setUTCDate(out.getUTCDate() - dayNum);
  return out;
};

const toCell = (day: ShootingDayView): DayCell => {
  const kpis = computeDayKpis(
    day.strips.map((s) => ({
      pageCount: s.pageCount,
      resolvedHours: s.resolvedHours,
      location: s.location,
      intExt: s.intExt,
    })),
  );
  return {
    day,
    hours: kpis.totalHours,
    primaryLocation: kpis.primaryLocation,
  };
};

const formatWeekLabel = (monday: Date): string => {
  const m = monday.getUTCMonth();
  const d = monday.getUTCDate();
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const sm = sunday.getUTCMonth();
  const sd = sunday.getUTCDate();
  if (m === sm) {
    return `${d}–${sd} ${ITALIAN_MONTHS[m]} ${sunday.getUTCFullYear()}`;
  }
  return `${d} ${ITALIAN_MONTHS[m]} – ${sd} ${ITALIAN_MONTHS[sm]} ${sunday.getUTCFullYear()}`;
};

const buildWeeks = (
  dated: ReadonlyArray<{ cell: DayCell; date: Date }>,
): CalendarWeek[] => {
  const byWeek = new Map<string, { monday: Date; cells: Map<number, DayCell> }>();
  for (const { cell, date } of dated) {
    const key = isoWeekKey(date);
    const bucket = byWeek.get(key) ?? {
      monday: mondayOf(date),
      cells: new Map<number, DayCell>(),
    };
    const dayNum = (date.getUTCDay() + 6) % 7;
    bucket.cells.set(dayNum, cell);
    byWeek.set(key, bucket);
  }
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b));
  return weeks.map(([key, { monday, cells }]) => ({
    id: key,
    label: formatWeekLabel(monday),
    cells: Array.from({ length: 7 }, (_, i) => cells.get(i) ?? null),
  }));
};

const densityClass = (hours: number): string => {
  if (hours > HEAVY_THRESHOLD) return styles.heavy ?? "";
  if (hours > 0 && hours < LIGHT_THRESHOLD) return styles.light ?? "";
  if (hours === 0) return styles.empty ?? "";
  return styles.normal ?? "";
};

export function ScheduleCalendarView({
  schedule,
  onSelectDay,
}: ScheduleCalendarViewProps) {
  const { t } = useTranslation();
  const { weeks, undated } = useMemo(() => {
    const dated: { cell: DayCell; date: Date }[] = [];
    const undatedCells: DayCell[] = [];
    for (const d of schedule.shootingDays) {
      const cell = toCell(d);
      const date = d.date ? parseIsoDate(d.date) : null;
      if (date) dated.push({ cell, date });
      else undatedCells.push(cell);
    }
    return { weeks: buildWeeks(dated), undated: undatedCells };
  }, [schedule]);

  const hasDated = weeks.length > 0;

  return (
    <div className={styles.wrap} data-testid="schedule-calendar-view">
      {undated.length > 0 && (
        <section
          className={styles.undatedBlock}
          aria-label={t("schedule.calendar.undatedAria")}
        >
          <header className={styles.blockHead}>
            <h3>{t("schedule.calendar.undatedHeading")}</h3>
            <span className={styles.blockMeta}>
              {undated.length}{" "}
              {undated.length === 1
                ? t("schedule.calendar.dayOne")
                : t("schedule.calendar.dayOther")}{" "}
              {t("schedule.calendar.withoutDate")}
            </span>
          </header>
          <div className={styles.undatedStrip}>
            {undated.map((c) => (
              <button
                key={c.day.id}
                type="button"
                className={`${styles.cell} ${styles.undated} ${densityClass(c.hours)}`}
                onClick={() => onSelectDay(c.day.id)}
                data-testid={`calendar-undated-${c.day.dayNumber}`}
              >
                <CellBody cell={c} />
              </button>
            ))}
          </div>
        </section>
      )}

      {hasDated ? (
        <section
          className={styles.calendar}
          aria-label={t("schedule.calendar.weeklyAria")}
        >
          <div className={styles.headerRow} aria-hidden="true">
            <span className={styles.weekColHead} />
            {WEEKDAYS_IT.map((d) => (
              <span key={d} className={styles.dayColHead}>
                {d}
              </span>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w.id} className={styles.weekRow}>
              <div className={styles.weekLabel}>{w.label}</div>
              {w.cells.map((c, i) =>
                c ? (
                  <button
                    key={c.day.id}
                    type="button"
                    className={`${styles.cell} ${densityClass(c.hours)}`}
                    onClick={() => onSelectDay(c.day.id)}
                    data-testid={`calendar-day-${c.day.dayNumber}`}
                  >
                    <CellBody cell={c} />
                  </button>
                ) : (
                  <div
                    key={`empty-${w.id}-${i}`}
                    className={`${styles.cell} ${styles.spacer}`}
                    aria-hidden="true"
                  />
                ),
              )}
            </div>
          ))}
        </section>
      ) : (
        undated.length === 0 && (
          <p className={styles.placeholder}>{t("schedule.calendar.empty")}</p>
        )
      )}
    </div>
  );
}

function CellBody({ cell }: { cell: DayCell }) {
  const { t } = useTranslation();
  const { day, hours, primaryLocation } = cell;
  return (
    <>
      <span className={styles.cellNum}>G{String(day.dayNumber).padStart(2, "0")}</span>
      <span className={styles.cellLoc}>
        {primaryLocation ? primaryLocation.toLowerCase() : "—"}
      </span>
      <span className={styles.cellMeta}>
        {day.strips.length} {t("schedule.calendar.scenesShort")} ·{" "}
        {formatDayHours(hours)}
      </span>
    </>
  );
}
