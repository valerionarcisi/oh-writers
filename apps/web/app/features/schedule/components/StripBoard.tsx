import type { ScheduleView } from "../server/schedule.server";
import { ShootingDayColumn } from "./ShootingDayColumn";
import styles from "./StripBoard.module.css";

interface StripBoardProps {
  schedule: ScheduleView;
  draggingStripId: string | null;
  onDragStart: (stripId: string) => void;
  onDrop: (dayId: string, position: number) => void;
  onLockToggle: (stripId: string) => void;
  onDateChange: (dayId: string, date: string | null) => void;
  onRemoveDay: (dayId: string) => void;
  onAddDay: () => void;
}

export function StripBoard({
  schedule,
  onDragStart,
  onDrop,
  onLockToggle,
  onDateChange,
  onRemoveDay,
  onAddDay,
}: StripBoardProps) {
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
