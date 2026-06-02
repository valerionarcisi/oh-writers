import { useMemo, useRef, useState } from "react";
import { Calendar, Pencil, Plus, Minus, X } from "lucide-react";
import { DropdownMenu } from "@oh-writers/ui";
import { computeDayKpis, formatDayHours } from "@oh-writers/domain";
import type { ShootingDayView, StripView } from "../server/schedule.server";
import { StripCard } from "./StripCard";
import { DayDifficultyBadge } from "./DayDifficultyBadge";
import { DayLocationWarningBanner } from "./DayLocationWarningBanner";
import { useDayEstimate, type DayWeatherAnchor } from "../hooks/useDayEstimate";
import { useTranslation } from "~/features/i18n";
import type { TranslationKey } from "@oh-writers/domain";
import styles from "./ShootingDayColumn.module.css";

interface ShootingDayColumnProps {
  day: ShootingDayView;
  unscheduledStrips: ReadonlyArray<StripView>;
  weatherAnchor: DayWeatherAnchor | null;
  onMoveStrip: (stripId: string, targetDayId: string | null) => void;
  onDragStart: (stripId: string) => void;
  onDrop: (dayId: string, position: number) => void;
  onLockToggle: (stripId: string) => void;
  onDateChange: (dayId: string, date: string | null) => void;
  onRemove: (dayId: string) => void;
  onStripClick: (sceneId: string) => void;
  onDayClick: (dayId: string) => void;
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
  return `${ITALIAN_WEEKDAYS[dt.getUTCDay()]} ${d} ${ITALIAN_MONTHS[m - 1]}`;
};

const formatShortDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

export function ShootingDayColumn({
  day,
  unscheduledStrips,
  weatherAnchor,
  onMoveStrip,
  onDragStart,
  onDrop,
  onLockToggle,
  onDateChange,
  onRemove,
  onStripClick,
  onDayClick,
}: ShootingDayColumnProps) {
  const { t } = useTranslation();
  const { estimate, weather, isWeatherLoading } = useDayEstimate({
    day,
    weatherAnchor,
  });
  const [dragOver, setDragOver] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const kpis = useMemo(
    () =>
      computeDayKpis(
        day.strips.map((s) => ({
          pageCount: s.pageCount,
          resolvedHours: s.resolvedHours,
          location: s.location,
          intExt: s.intExt,
        })),
      ),
    [day.strips],
  );

  const openDatePicker = () => {
    setIsEditingDate(true);
    requestAnimationFrame(() => {
      const el = dateInputRef.current;
      if (!el) return;
      el.focus();
      const picker = (el as HTMLInputElement & { showPicker?: () => void })
        .showPicker;
      if (typeof picker === "function") picker.call(el);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onDrop(day.id, day.strips.length);
  };

  const dayTypeLabelKey: Record<
    ShootingDayView["dayType"],
    TranslationKey | null
  > = {
    shoot: null,
    travel: "schedule.dayColumn.dayType.travel",
    rest: "schedule.dayColumn.dayType.rest",
    prep: "schedule.dayColumn.dayType.prep",
  };

  const isRest = day.dayType === "rest";

  return (
    <article
      className={`${styles.column} ${isRest ? styles.rest : ""}`}
      data-testid={`day-column-${day.dayNumber}`}
    >
      <header
        className={styles.header}
        onClick={() => onDayClick(day.id)}
        title={t("schedule.dayColumn.openDetails")}
      >
        <div className={styles.headerTop}>
          <span
            className={styles.dayNumber}
            data-testid={`day-header-${day.dayNumber}`}
          >
            {t("schedule.dayColumn.day")}{" "}
            {String(day.dayNumber).padStart(2, "0")}
          </span>
          {day.dayType !== "shoot" && (
            <span className={styles.dayTypeBadge} data-type={day.dayType}>
              {(() => {
                const key = dayTypeLabelKey[day.dayType];
                return key ? t(key) : "";
              })()}
            </span>
          )}
          <div
            className={styles.headerActions}
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu
              align="end"
              data-testid={`add-scene-${day.dayNumber}`}
              triggerClassName={styles.actionBtn}
              triggerLabel={t("schedule.dayColumn.addScene")}
              triggerTitle={t("schedule.dayColumn.addSceneToDay")}
              triggerDisabled={unscheduledStrips.length === 0}
              trigger={<Plus size={12} strokeWidth={2} aria-hidden="true" />}
              items={
                unscheduledStrips.length === 0
                  ? [
                      {
                        label: t("schedule.dayColumn.noSceneToAdd"),
                        onClick: () => undefined,
                        disabled: true,
                      },
                    ]
                  : unscheduledStrips.map((s) => ({
                      label: `SC ${s.sceneNumber} · ${s.location ?? "—"}`,
                      description: [s.timeOfDay, s.intExt]
                        .filter(Boolean)
                        .join(" · "),
                      onClick: () => onMoveStrip(s.id, day.id),
                    }))
              }
            />
            <DropdownMenu
              align="end"
              data-testid={`remove-scene-${day.dayNumber}`}
              triggerClassName={styles.actionBtn}
              triggerLabel={t("schedule.dayColumn.removeScene")}
              triggerTitle={t("schedule.dayColumn.removeSceneFromDay")}
              triggerDisabled={day.strips.length === 0}
              trigger={<Minus size={12} strokeWidth={2} aria-hidden="true" />}
              items={
                day.strips.length === 0
                  ? [
                      {
                        label: t("schedule.dayColumn.noSceneInDay"),
                        onClick: () => undefined,
                        disabled: true,
                      },
                    ]
                  : day.strips.map((s) => ({
                      label: `SC ${s.sceneNumber} · ${s.location ?? "—"}`,
                      description: t("schedule.dayColumn.moveToUnscheduled"),
                      onClick: () => onMoveStrip(s.id, null),
                    }))
              }
            />
            <button
              type="button"
              className={styles.removeBtn}
              title={t("schedule.dayColumn.removeDay")}
              aria-label={t("schedule.dayColumn.removeDay")}
              data-testid={`remove-day-${day.dayNumber}`}
              onClick={() => onRemove(day.id)}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className={styles.dateWrap} onClick={(e) => e.stopPropagation()}>
          {isEditingDate || day.date ? (
            <>
              <input
                ref={dateInputRef}
                type="date"
                className={styles.dateInput}
                value={day.date ?? ""}
                data-testid={`day-date-${day.dayNumber}`}
                hidden={!isEditingDate}
                onChange={(e) => onDateChange(day.id, e.target.value || null)}
                onBlur={() => setIsEditingDate(false)}
              />
              {!isEditingDate && day.date && (
                <button
                  type="button"
                  className={styles.dateDisplay}
                  onClick={openDatePicker}
                  aria-label={t("schedule.dayColumn.editDate")}
                  title={t("schedule.dayColumn.editDate")}
                >
                  <span>{formatLongDate(day.date)}</span>
                  <Pencil size={11} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className={styles.dateSet}
              onClick={openDatePicker}
              data-testid={`day-date-set-${day.dayNumber}`}
              aria-label={t("schedule.dayColumn.setDate")}
            >
              <Calendar size={12} strokeWidth={2} aria-hidden="true" />
              <span>{t("schedule.dayColumn.setDate")}</span>
            </button>
          )}
        </div>

        {!isRest && (
          <div
            className={styles.kpiRow}
            aria-label={t("schedule.dayColumn.summaryAria")}
          >
            <span className={styles.kpi}>
              <b>{kpis.sceneCount}</b> {t("schedule.dayColumn.scenes")}
            </span>
            <span className={styles.kpi}>
              <b>{kpis.totalPages}</b> {t("schedule.dayColumn.pages")}
            </span>
            <span
              className={styles.kpi}
              data-tone={kpis.totalHours > 10 ? "warn" : "default"}
            >
              <b>{formatDayHours(kpis.totalHours)}</b>
            </span>
            {kpis.primaryLocation && (
              <span className={styles.kpiLoc} title={kpis.primaryLocation}>
                {kpis.intExtMix} · {kpis.primaryLocation}
              </span>
            )}
          </div>
        )}
        {isRest && (
          <div className={styles.restLabel}>
            {t("schedule.dayColumn.restDay")}
          </div>
        )}
        {!isRest && day.strips.length > 0 && (
          <DayDifficultyBadge
            estimate={estimate}
            weather={weather}
            isWeatherLoading={isWeatherLoading}
            dayNumber={day.dayNumber}
          />
        )}
        {!isRest && day.strips.length > 0 && (
          <DayLocationWarningBanner dayId={day.id} dayNumber={day.dayNumber} />
        )}
      </header>

      <div
        className={`${styles.stripsArea} ${dragOver ? styles.dragOver : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        data-testid={`day-drop-${day.id}`}
      >
        {day.strips.map((strip) => (
          <StripCard
            key={strip.id}
            strip={strip}
            onDragStart={onDragStart}
            onLockToggle={onLockToggle}
            onStripClick={onStripClick}
          />
        ))}
      </div>
    </article>
  );
}

export { formatShortDate };
