import { useQuery } from "@tanstack/react-query";
import {
  buildDayCells,
  buildWeekRows,
  formatMinutes,
  getDayAbbrev,
  type DayCell,
  type WeekRow,
} from "./calendar-grid.utils";
import type { SceneWithPlanSummary } from "../server/shooting-plan.server";
import { scheduleQueryOptions } from "../../schedule/server/schedule.server";
import styles from "./CalendarGridView.module.css";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface CalendarGridViewProps {
  projectId: string;
  scenes: SceneWithPlanSummary[];
  onSwitchToPerScena?: (firstSceneId?: string) => void;
}

// ─── Column header row (Mon–Sun) ───────────────────────────────────────────────

const DAY_HEADERS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

// ─── Day cell component ────────────────────────────────────────────────────────

interface DayCellCardProps {
  cell: DayCell;
  onClick: () => void;
}

function DayCellCard({ cell, onClick }: DayCellCardProps) {
  const dateAbbrev = cell.date ? getDayAbbrev(cell.date) : null;
  const calendarDay = cell.date ? parseInt(cell.date.split("-")[2] ?? "0", 10) : null;

  return (
    <button
      type="button"
      className={styles.dayCell}
      data-overloaded={cell.isOverloaded || undefined}
      onClick={onClick}
      aria-label={`Giorno ${cell.dayNumber}: ${cell.sceneCount} scene, ${cell.shotCount} inquadrature`}
    >
      {/* Cell header row: calendar day + day-number badge */}
      <div className={styles.dayCellHead}>
        <div className={styles.dayCellDate}>
          {calendarDay !== null && (
            <span className={styles.dayNum}>{calendarDay}</span>
          )}
          {dateAbbrev && <span className={styles.dayAbbr}>{dateAbbrev.toUpperCase()}</span>}
        </div>
        <span className={styles.dayBadge}>G·{cell.dayNumber}</span>
      </div>

      {/* Primary location */}
      {cell.primaryLocation && (
        <div className={styles.dayLocation} title={cell.primaryLocation}>
          {cell.primaryLocation}
        </div>
      )}

      {/* Pills row */}
      <div className={styles.dayPills}>
        <span className={styles.pillScene}>{cell.sceneCount} {cell.sceneCount === 1 ? "sc" : "sc"}</span>
        <span className={styles.pillShot}>{cell.shotCount} inq</span>
      </div>

      {/* Duration bar */}
      <div className={styles.dayDuration}>
        <div className={styles.dayDurationLabel}>
          <span className={styles.dayDurationText}>
            {cell.totalMinutes > 0 ? formatMinutes(cell.totalMinutes) : "—"} / 8h
          </span>
          <span className={styles.dayDurationPct}>{cell.durationPct}%</span>
        </div>
        <div className={styles.dayProgress}>
          <div
            className={styles.dayProgressFill}
            style={{ width: `${cell.durationPct}%` }}
          />
        </div>
      </div>

      {/* Overload warning dot */}
      {cell.isOverloaded && <span className={styles.dayWarning} aria-hidden />}

      {/* Hover hint */}
      <span className={styles.dayHoverHint} aria-hidden>Apri →</span>
    </button>
  );
}

// ─── Empty cell (no shooting scheduled) ────────────────────────────────────────

interface EmptyCellProps {
  isWeekend: boolean;
}

function EmptyCell({ isWeekend }: EmptyCellProps) {
  return (
    <div
      className={styles.emptyCell}
      data-weekend={isWeekend || undefined}
      aria-hidden
    >
      <span className={styles.emptyCellLabel}>
        {isWeekend ? "Riposo" : "—"}
      </span>
    </div>
  );
}

// ─── Week row ─────────────────────────────────────────────────────────────────

interface WeekRowBlockProps {
  week: WeekRow;
  weekId: string;
  onDayClick: (cell: DayCell) => void;
}

function WeekRowBlock({ week, weekId, onDayClick }: WeekRowBlockProps) {
  return (
    <div className={styles.weekBlock} id={weekId}>
      {/* Week header */}
      <div className={styles.weekHeader}>
        <span className={styles.weekTitle}>{week.label}</span>
        {week.dateRangeLabel && (
          <span className={styles.weekDates}>{week.dateRangeLabel}</span>
        )}
        <div className={styles.weekStats}>
          <span><strong>{week.activeDays}</strong> {week.activeDays === 1 ? "giorno" : "giorni"}</span>
          <span><strong>{week.totalScenes}</strong> scene</span>
          <span><strong>{week.totalShots}</strong> inq</span>
          {week.totalMinutes > 0 && (
            <span><strong>{formatMinutes(week.totalMinutes)}</strong> pianificate</span>
          )}
        </div>
      </div>

      {/* Column headers — always rendered once per week */}
      <div className={styles.weekGrid}>
        {DAY_HEADERS_IT.map((label, i) => (
          <div
            key={label}
            className={styles.colHeader}
            data-weekend={i >= 5 || undefined}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day slots */}
      <div className={styles.weekGrid}>
        {week.slots.map((slot, i) =>
          slot.dayCell ? (
            <DayCellCard
              key={slot.dayCell.dayNumber}
              cell={slot.dayCell}
              onClick={() => onDayClick(slot.dayCell!)}
            />
          ) : (
            <EmptyCell key={`empty-${i}`} isWeekend={slot.isWeekend} />
          ),
        )}
      </div>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function NoScheduleState() {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyStateText}>
        Nessun piano di lavorazione trovato. Genera un piano dalla sezione Schedule.
      </p>
    </div>
  );
}

function NoDaysState() {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyStateText}>
        Nessun giorno di ripresa pianificato ancora.
      </p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function CalendarGridView({
  projectId,
  scenes,
  onSwitchToPerScena,
}: CalendarGridViewProps) {
  const scheduleQuery = useQuery(scheduleQueryOptions(projectId));

  const scheduleData =
    scheduleQuery.data?.isOk && scheduleQuery.data.value
      ? scheduleQuery.data.value
      : null;

  const shootingDays = scheduleData?.shootingDays ?? [];
  const dayCells = buildDayCells(shootingDays, scenes);
  const weekRows = buildWeekRows(dayCells);

  const handleDayClick = (cell: DayCell) => {
    if (!onSwitchToPerScena) return;
    const firstSceneId = cell.sceneIds[0];
    onSwitchToPerScena(firstSceneId);
  };

  if (scheduleQuery.isLoading) {
    return (
      <div className={styles.loading}>
        <span className={styles.loadingText}>Caricamento calendario…</span>
      </div>
    );
  }

  if (!scheduleData) {
    return <NoScheduleState />;
  }

  if (weekRows.length === 0) {
    return <NoDaysState />;
  }

  return (
    <div className={styles.root}>
      {/* Week sidebar */}
      <aside className={styles.weekSidebar}>
        <div className={styles.weekSidebarTitle}>Settimane</div>
        {weekRows.map((week) => (
          <a
            key={week.weekIndex}
            className={styles.weekSidebarItem}
            href={`#week-${week.weekIndex}`}
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById(`week-${week.weekIndex}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className={styles.weekSidebarLabel}>{week.label}</span>
            {week.dateRangeLabel && (
              <span className={styles.weekSidebarDates}>{week.dateRangeLabel}</span>
            )}
            <span className={styles.weekSidebarMeta}>
              {week.activeDays} {week.activeDays === 1 ? "giorno" : "giorni"} · {week.totalScenes} sc
            </span>
          </a>
        ))}

        <div className={styles.weekSidebarDivider} />

        <div className={styles.sidebarTotals}>
          <div className={styles.sidebarTotalsTitle}>Totale progetto</div>
          <div className={styles.sidebarTotalsRow}>
            <span className={styles.sidebarTotalsLabel}>Giorni</span>
            <span className={styles.sidebarTotalsValue}>{dayCells.length}</span>
          </div>
          <div className={styles.sidebarTotalsRow}>
            <span className={styles.sidebarTotalsLabel}>Scene</span>
            <span className={styles.sidebarTotalsValue}>
              {dayCells.reduce((sum, c) => sum + c.sceneCount, 0)}
            </span>
          </div>
          <div className={styles.sidebarTotalsRow}>
            <span className={styles.sidebarTotalsLabel}>Inquadrature</span>
            <span className={styles.sidebarTotalsValue} data-accent>
              {dayCells.reduce((sum, c) => sum + c.shotCount, 0)}
            </span>
          </div>
          {dayCells.some((c) => c.totalMinutes > 0) && (
            <div className={styles.sidebarTotalsRow}>
              <span className={styles.sidebarTotalsLabel}>Pianificate</span>
              <span className={styles.sidebarTotalsValue}>
                {formatMinutes(dayCells.reduce((sum, c) => sum + c.totalMinutes, 0))}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Calendar area */}
      <div className={styles.calendarArea}>
        {weekRows.map((week) => (
          <WeekRowBlock
            key={week.weekIndex}
            week={week}
            weekId={`week-${week.weekIndex}`}
            onDayClick={handleDayClick}
          />
        ))}
      </div>
    </div>
  );
}
