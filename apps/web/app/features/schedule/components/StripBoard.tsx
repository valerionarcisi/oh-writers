import type { ScheduleView, StripView } from "../server/schedule.server";
import { ShootingDayColumn } from "./ShootingDayColumn";
import styles from "./StripBoard.module.css";

const DAYS_PER_WEEK = 6;

interface StripBoardProps {
  schedule: ScheduleView;
  draggingStripId: string | null;
  viewMode: "days" | "weeks";
  unscheduledStrips: ReadonlyArray<StripView>;
  onMoveStrip: (stripId: string, targetDayId: string | null) => void;
  onDragStart: (stripId: string) => void;
  onDrop: (dayId: string, position: number) => void;
  onLockToggle: (stripId: string) => void;
  onDateChange: (dayId: string, date: string | null) => void;
  onRemoveDay: (dayId: string) => void;
  onAddDay: () => void;
  onAddWeek: () => void;
  onStripClick: (sceneId: string) => void;
  onDayClick: (dayId: string) => void;
}

export function StripBoard({
  schedule,
  viewMode,
  unscheduledStrips,
  onMoveStrip,
  onDragStart,
  onDrop,
  onLockToggle,
  onDateChange,
  onRemoveDay,
  onAddDay,
  onAddWeek,
  onStripClick,
  onDayClick,
}: StripBoardProps) {
  if (viewMode === "weeks") {
    const weeks: Array<{
      weekNumber: number;
      days: ScheduleView["shootingDays"];
    }> = [];

    for (const day of schedule.shootingDays) {
      const weekNumber = Math.ceil(day.dayNumber / DAYS_PER_WEEK);
      const week = weeks.find((w) => w.weekNumber === weekNumber);
      if (week) {
        week.days.push(day);
      } else {
        weeks.push({ weekNumber, days: [day] });
      }
    }

    return (
      <div className={styles.weeksBoard} data-testid="strip-board">
        {weeks.map((week) => (
          <div key={week.weekNumber} className={styles.weekGroup}>
            <div className={styles.weekLabel}>
              Settimana {week.weekNumber}
              <span className={styles.weekActions}>
                <button
                  type="button"
                  className={styles.weekActionBtn}
                  title="Aggiungi giorno a questa settimana"
                  onClick={onAddDay}
                >
                  +
                </button>
              </span>
            </div>
            <div className={styles.weekDays}>
              {week.days.map((day) => (
                <ShootingDayColumn
                  key={day.id}
                  day={day}
                  unscheduledStrips={unscheduledStrips}
                  onMoveStrip={onMoveStrip}
                  onDragStart={onDragStart}
                  onDrop={onDrop}
                  onLockToggle={onLockToggle}
                  onDateChange={onDateChange}
                  onRemove={onRemoveDay}
                  onStripClick={onStripClick}
                  onDayClick={onDayClick}
                />
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          className={styles.addWeekBtn}
          title="Aggiungi settimana"
          data-testid="add-week-btn"
          onClick={onAddWeek}
        >
          + Aggiungi settimana
        </button>
      </div>
    );
  }

  return (
    <div className={styles.board} data-testid="strip-board">
      {schedule.shootingDays.map((day) => (
        <ShootingDayColumn
          key={day.id}
          day={day}
          unscheduledStrips={unscheduledStrips}
          onMoveStrip={onMoveStrip}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onLockToggle={onLockToggle}
          onDateChange={onDateChange}
          onRemove={onRemoveDay}
          onStripClick={onStripClick}
          onDayClick={onDayClick}
        />
      ))}
      <button
        type="button"
        className={styles.addDayBtn}
        title="Aggiungi giorno"
        data-testid="add-day-btn"
        onClick={onAddDay}
      >
        +
      </button>
    </div>
  );
}
