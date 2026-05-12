import type { ScheduleView } from "../server/schedule.server";
import { ShootingDayColumn } from "./ShootingDayColumn";
import styles from "./StripBoard.module.css";

const DAYS_PER_WEEK = 6;

interface StripBoardProps {
  schedule: ScheduleView;
  draggingStripId: string | null;
  viewMode: "days" | "weeks";
  onDragStart: (stripId: string) => void;
  onDrop: (dayId: string, position: number) => void;
  onLockToggle: (stripId: string) => void;
  onDateChange: (dayId: string, date: string | null) => void;
  onRemoveDay: (dayId: string) => void;
  onAddDay: () => void;
  onStripClick: (sceneId: string) => void;
  onDayClick: (dayId: string) => void;
}

export function StripBoard({
  schedule,
  viewMode,
  onDragStart,
  onDrop,
  onLockToggle,
  onDateChange,
  onRemoveDay,
  onAddDay,
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
            <div className={styles.weekLabel}>Settimana {week.weekNumber}</div>
            <div className={styles.weekDays}>
              {week.days.map((day) => (
                <ShootingDayColumn
                  key={day.id}
                  day={day}
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

  return (
    <div className={styles.board} data-testid="strip-board">
      {schedule.shootingDays.map((day) => (
        <ShootingDayColumn
          key={day.id}
          day={day}
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
