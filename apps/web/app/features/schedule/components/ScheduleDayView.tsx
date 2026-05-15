import { useEffect, useMemo, useRef, useState } from "react";
import { computeDayKpis, formatDayHours } from "@oh-writers/domain";
import type { ScheduleView, ShootingDayView } from "../server/schedule.server";
import styles from "./ScheduleDayView.module.css";

interface ScheduleDayViewProps {
  schedule: ScheduleView;
  dayId: string | null;
  onSelectDay: (dayId: string) => void;
  onNotesChange: (dayId: string, notes: string | null) => void;
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
  notesSaving,
}: ScheduleDayViewProps) {
  const day = resolveActiveDay(schedule, dayId);
  const [notesDraft, setNotesDraft] = useState(day?.notes ?? "");
  const lastFlushRef = useRef<string>(day?.notes ?? "");

  useEffect(() => {
    setNotesDraft(day?.notes ?? "");
    lastFlushRef.current = day?.notes ?? "";
  }, [day?.id, day?.notes]);

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
    return (
      <div className={styles.empty}>
        Nessuna giornata disponibile. Genera prima il piano di lavorazione.
      </div>
    );
  }

  return (
    <div className={styles.wrap} data-testid="schedule-day-view">
      <nav className={styles.dayNav} aria-label="Naviga giornate">
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
            GIORNATA {String(day.dayNumber).padStart(2, "0")}
            {day.date && ` · ${formatLongDate(day.date).toUpperCase()}`}
          </span>
          <h1 className={styles.title}>
            {kpis.primaryLocation
              ? kpis.primaryLocation.toLowerCase()
              : "Da pianificare"}
          </h1>
          <div className={styles.subline}>
            {kpis.sceneCount}{" "}
            {kpis.sceneCount === 1 ? "scena" : "scene"} ·{" "}
            {kpis.totalPages} pag · {formatDayHours(kpis.totalHours)}
          </div>
        </div>
        <div className={styles.heroMeta}>
          {/* TODO Spec 12: crewCallTime / shootStartTime / wrapTime from
              shooting_days schema additions. */}
          <span className={styles.metaRow}>
            <span>Crew call</span>
            <b>—</b>
          </span>
          <span className={styles.metaRow}>
            <span>Shoot</span>
            <b>—</b>
          </span>
          <span className={styles.metaRow}>
            <span>Wrap</span>
            <b>—</b>
          </span>
        </div>
      </header>

      <section className={styles.card} aria-label="Scene della giornata">
        <header className={styles.cardHead}>
          <h3>Scene della giornata</h3>
          <span className={styles.cardMeta}>
            {kpis.sceneCount} scene · {kpis.totalPages} pag ·{" "}
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
              Nessuna scena assegnata a questa giornata.
            </li>
          )}
        </ul>
      </section>

      <div className={styles.grid}>
        <section className={styles.card} aria-label="Cast richiesto">
          <header className={styles.cardHead}>
            <h3>Cast richiesto · DOOD</h3>
            <span className={styles.cardMeta}>—</span>
          </header>
          <div className={styles.cardBody}>
            {/* TODO Spec 12b: derive cast from scene → personaggi join
                + cast_availability table for conflict highlight. */}
            <p className={styles.placeholder}>
              L'elenco cast con orari di trucco e conflitti di disponibilità
              sarà disponibile quando la tabella <code>cast_availability</code>{" "}
              sarà aggiunta allo schema.
            </p>
          </div>
        </section>

        <section className={styles.card} aria-label="Location">
          <header className={styles.cardHead}>
            <h3>Location</h3>
            <span className={styles.cardMeta}>
              {kpis.locationCount}{" "}
              {kpis.locationCount === 1 ? "location" : "location"}
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
                  Indirizzo e dettagli logistici disponibili dopo l'aggiunta
                  del campo <code>locationId</code> a{" "}
                  <code>shooting_days</code>.
                </div>
              </div>
            ) : (
              <p className={styles.placeholder}>Nessuna location dominante.</p>
            )}
          </div>
        </section>

        <section className={styles.card} aria-label="Reparti">
          <header className={styles.cardHead}>
            <h3>Reparti</h3>
            <span className={styles.cardMeta}>—</span>
          </header>
          <div className={styles.cardBody}>
            {/* TODO Spec 12b: strips.requiredDepartmentIds enrichment. */}
            <p className={styles.placeholder}>
              Camera, luci, suono, costumi, trucco, FX, catering — saranno
              elencati dopo l'introduzione del campo{" "}
              <code>requiredDepartmentIds</code> sulle strip.
            </p>
          </div>
        </section>

        <section className={styles.card} aria-label="Note di giornata">
          <header className={styles.cardHead}>
            <h3>Note di giornata</h3>
            <span className={styles.cardMeta}>
              {notesSaving ? "Salvataggio…" : notesDraft ? "Salvate" : "Vuote"}
            </span>
          </header>
          <div className={styles.cardBody}>
            <textarea
              className={styles.notesTextarea}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Promemoria per la regia, la troupe, la produzione…"
              rows={6}
              aria-label="Note di giornata"
              data-testid={`day-notes-${day.dayNumber}`}
            />
          </div>
        </section>

        <section className={styles.card} aria-label="Sole e meteo">
          <header className={styles.cardHead}>
            <h3>Sole · meteo · magic hour</h3>
            <span className={styles.cardMeta}>—</span>
          </header>
          <div className={styles.cardBody}>
            {/* TODO Spec 12b: weather/sunrise/sunset cache on shooting_days. */}
            <p className={styles.placeholder}>
              Alba, tramonto, magic hour e meteo verranno pre-calcolati su{" "}
              <code>date + location</code> tramite l'integrazione meteo.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
