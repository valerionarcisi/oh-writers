import { useEffect, useMemo, useRef, useState } from "react";
import { computeDayKpis, formatDayHours } from "@oh-writers/domain";
import type { ScheduleView, ShootingDayView } from "../server/schedule.server";
import { useTranslation } from "~/features/i18n";
import styles from "./ScheduleDayView.module.css";

interface ScheduleDayViewProps {
  schedule: ScheduleView;
  dayId: string | null;
  onSelectDay: (dayId: string) => void;
  onNotesChange: (dayId: string, notes: string | null) => void;
  onTimesChange: (dayId: string, patch: { crewCallTime?: string | null; shootStartTime?: string | null; wrapTime?: string | null }) => void;
  notesSaving: boolean;
}

const ITALIAN_WEEKDAYS = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
];
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

const formatLongDate = (iso: string): string => {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${ITALIAN_WEEKDAYS[dt.getUTCDay()]} ${d} ${ITALIAN_MONTHS[m - 1]} ${y}`;
};

const resolveActiveDay = (
  schedule: ScheduleView,
  dayId: string | null,
): ShootingDayView | null => {
  if (dayId) {
    const day = schedule.shootingDays.find((d) => d.id === dayId);
    if (day) return day;
  }
  return schedule.shootingDays[0] ?? null;
};

export function ScheduleDayView({
  schedule,
  dayId,
  onSelectDay,
  onNotesChange,
  onTimesChange,
  notesSaving,
}: ScheduleDayViewProps) {
  const { t } = useTranslation();
  const day = resolveActiveDay(schedule, dayId);
  const [notesDraft, setNotesDraft] = useState(day?.notes ?? "");
  const lastFlushRef = useRef<string>(day?.notes ?? "");
  const [crewCall, setCrewCall] = useState(day?.crewCallTime ?? "");
  const [shootStart, setShootStart] = useState(day?.shootStartTime ?? "");
  const [wrap, setWrap] = useState(day?.wrapTime ?? "");

  useEffect(() => {
    setNotesDraft(day?.notes ?? "");
    lastFlushRef.current = day?.notes ?? "";
    setCrewCall(day?.crewCallTime ?? "");
    setShootStart(day?.shootStartTime ?? "");
    setWrap(day?.wrapTime ?? "");
  }, [day?.id, day?.notes, day?.crewCallTime, day?.shootStartTime, day?.wrapTime]);

  useEffect(() => {
    if (!day) return;
    const original = lastFlushRef.current;
    if (notesDraft === original) return;
    const t = window.setTimeout(() => {
      lastFlushRef.current = notesDraft;
      onNotesChange(day.id, notesDraft.trim() === "" ? null : notesDraft);
    }, 700);
    return () => window.clearTimeout(t);
  }, [notesDraft, day, onNotesChange]);

  const kpis = useMemo(() => {
    if (!day) return null;
    return computeDayKpis(
      day.strips.map((s) => ({
        pageCount: s.pageCount,
        resolvedHours: s.resolvedHours,
        location: s.location,
        intExt: s.intExt,
      })),
    );
  }, [day]);

  if (!day || !kpis) {
    return <div className={styles.empty}>{t("schedule.dayView.empty")}</div>;
  }

  return (
    <div className={styles.wrap} data-testid="schedule-day-view">
      <nav
        className={styles.dayNav}
        aria-label={t("schedule.dayView.navAria")}
      >
        {schedule.shootingDays.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`${styles.dayChip} ${d.id === day.id ? styles.active : ""}`}
            onClick={() => onSelectDay(d.id)}
            aria-current={d.id === day.id}
            data-testid={`day-chip-${d.dayNumber}`}
          >
            G {String(d.dayNumber).padStart(2, "0")}
          </button>
        ))}
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            {t("schedule.dayView.day")}{" "}
            {String(day.dayNumber).padStart(2, "0")}
            {day.date && ` · ${formatLongDate(day.date).toUpperCase()}`}
          </span>
          <h1 className={styles.title}>
            {kpis.primaryLocation
              ? kpis.primaryLocation.toLowerCase()
              : t("schedule.dayView.toPlan")}
          </h1>
          <div className={styles.subline}>
            {kpis.sceneCount}{" "}
            {kpis.sceneCount === 1
              ? t("schedule.dayView.sceneOne")
              : t("schedule.dayView.sceneOther")}{" "}
            · {kpis.totalPages} {t("schedule.pagesShortBare")} ·{" "}
            {formatDayHours(kpis.totalHours)}
          </div>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.metaRow}>
            <span>{t("schedule.dayView.crewCall")}</span>
            <input
              type="time"
              className={styles.timeInput}
              value={crewCall}
              onChange={(e) => setCrewCall(e.target.value)}
              onBlur={() => day && onTimesChange(day.id, { crewCallTime: crewCall || null })}
            />
          </span>
          <span className={styles.metaRow}>
            <span>{t("schedule.dayView.shoot")}</span>
            <input
              type="time"
              className={styles.timeInput}
              value={shootStart}
              onChange={(e) => setShootStart(e.target.value)}
              onBlur={() => day && onTimesChange(day.id, { shootStartTime: shootStart || null })}
            />
          </span>
          <span className={styles.metaRow}>
            <span>{t("schedule.dayView.wrap")}</span>
            <input
              type="time"
              className={styles.timeInput}
              value={wrap}
              onChange={(e) => setWrap(e.target.value)}
              onBlur={() => day && onTimesChange(day.id, { wrapTime: wrap || null })}
            />
          </span>
        </div>
      </header>

      <section
        className={styles.card}
        aria-label={t("schedule.dayView.scenesOfDayAria")}
      >
        <header className={styles.cardHead}>
          <h3>{t("schedule.dayView.scenesOfDay")}</h3>
          <span className={styles.cardMeta}>
            {kpis.sceneCount} {t("schedule.dayView.sceneOther")} ·{" "}
            {kpis.totalPages} {t("schedule.pagesShortBare")} ·{" "}
            {formatDayHours(kpis.totalHours)}
          </span>
        </header>
        <ul className={styles.scenesList}>
          {day.strips.map((s) => (
            <li
              key={s.id}
              className={styles.scene}
              data-color={s.bannerColor}
              data-testid={`day-scene-${s.sceneNumber}`}
            >
              <span className={styles.flag} aria-hidden="true" />
              <span className={styles.sceneNum}>SC. {s.sceneNumber}</span>
              <span className={styles.sceneTitle}>
                <span className={styles.sceneHeading}>{s.location}</span>
                <span className={styles.sceneSub}>
                  {[s.timeOfDay, s.intExt].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className={styles.sceneHours}>
                {formatDayHours(s.resolvedHours)}
              </span>
              <span className={styles.scenePages}>{s.pageCount} p</span>
            </li>
          ))}
          {day.strips.length === 0 && (
            <li className={styles.sceneEmpty}>
              {t("schedule.dayView.noScenesAssigned")}
            </li>
          )}
        </ul>
      </section>

      <div className={styles.grid}>
        <section
          className={styles.card}
          aria-label={t("schedule.dayView.castRequiredAria")}
        >
          <header className={styles.cardHead}>
            <h3>{t("schedule.dayView.castRequired")}</h3>
            <span className={styles.cardMeta}>—</span>
          </header>
          <div className={styles.cardBody}>
            {/* TODO Spec 12b: derive cast from scene → personaggi join
                + cast_availability table for conflict highlight. */}
            <p className={styles.placeholder}>
              {t("schedule.dayView.castPlaceholderBefore")}{" "}
              <code>cast_availability</code>{" "}
              {t("schedule.dayView.castPlaceholderAfter")}
            </p>
          </div>
        </section>

        <section
          className={styles.card}
          aria-label={t("schedule.dayView.locationAria")}
        >
          <header className={styles.cardHead}>
            <h3>{t("schedule.dayView.location")}</h3>
            <span className={styles.cardMeta}>
              {kpis.locationCount}{" "}
              {kpis.locationCount === 1
                ? t("schedule.dayView.locationOne")
                : t("schedule.dayView.locationOther")}
            </span>
          </header>
          <div className={styles.cardBody}>
            {kpis.primaryLocation ? (
              <div className={styles.locationRow}>
                <div className={styles.locationName}>
                  {kpis.primaryLocation}
                </div>
                <div className={styles.locationSub}>
                  {/* TODO Spec 12b: shooting_days.locationId FK +
                       secondary locations + permits/distance. */}
                  {t("schedule.dayView.locationDetailsBefore")}{" "}
                  <code>locationId</code>{" "}
                  {t("schedule.dayView.locationDetailsMid")}{" "}
                  <code>shooting_days</code>.
                </div>
              </div>
            ) : (
              <p className={styles.placeholder}>
                {t("schedule.dayView.noPrimaryLocation")}
              </p>
            )}
          </div>
        </section>

        <section
          className={styles.card}
          aria-label={t("schedule.dayView.departmentsAria")}
        >
          <header className={styles.cardHead}>
            <h3>{t("schedule.dayView.departments")}</h3>
            <span className={styles.cardMeta}>—</span>
          </header>
          <div className={styles.cardBody}>
            {/* TODO Spec 12b: strips.requiredDepartmentIds enrichment. */}
            <p className={styles.placeholder}>
              {t("schedule.dayView.departmentsPlaceholderBefore")}{" "}
              <code>requiredDepartmentIds</code>{" "}
              {t("schedule.dayView.departmentsPlaceholderAfter")}
            </p>
          </div>
        </section>

        <section
          className={styles.card}
          aria-label={t("schedule.dayView.notesAria")}
        >
          <header className={styles.cardHead}>
            <h3>{t("schedule.dayView.notes")}</h3>
            <span className={styles.cardMeta}>
              {notesSaving
                ? t("schedule.dayView.notesSaving")
                : notesDraft
                  ? t("schedule.dayView.notesSaved")
                  : t("schedule.dayView.notesEmpty")}
            </span>
          </header>
          <div className={styles.cardBody}>
            <textarea
              className={styles.notesTextarea}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder={t("schedule.dayView.notesPlaceholder")}
              rows={6}
              aria-label={t("schedule.dayView.notes")}
              data-testid={`day-notes-${day.dayNumber}`}
            />
          </div>
        </section>

        <section
          className={styles.card}
          aria-label={t("schedule.dayView.sunWeatherAria")}
        >
          <header className={styles.cardHead}>
            <h3>{t("schedule.dayView.sunWeather")}</h3>
            <span className={styles.cardMeta}>—</span>
          </header>
          <div className={styles.cardBody}>
            {/* TODO Spec 12b: weather/sunrise/sunset cache on shooting_days. */}
            <p className={styles.placeholder}>
              {t("schedule.dayView.sunWeatherPlaceholderBefore")}{" "}
              <code>date + location</code>{" "}
              {t("schedule.dayView.sunWeatherPlaceholderAfter")}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
