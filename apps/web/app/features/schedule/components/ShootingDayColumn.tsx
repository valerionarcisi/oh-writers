import { useRef, useState } from "react";
import { Calendar, Pencil, X } from "lucide-react";
import type { ShootingDayView } from "../server/schedule.server";
import { StripCard } from "./StripCard";
import { PageCountBar } from "./PageCountBar";
import styles from "./ShootingDayColumn.module.css";

interface ShootingDayColumnProps {
  day: ShootingDayView;
  onDragStart: (stripId: string) => void;
  onDrop: (dayId: string, position: number) => void;
  onLockToggle: (stripId: string) => void;
  onDateChange: (dayId: string, date: string | null) => void;
  onRemove: (dayId: string) => void;
  onStripClick: (sceneId: string) => void;
  onDayClick: (dayId: string) => void;
}

export function ShootingDayColumn({
  day,
  onDragStart,
  onDrop,
  onLockToggle,
  onDateChange,
  onRemove,
  onStripClick,
  onDayClick,
}: ShootingDayColumnProps) {
  const [dragOver, setDragOver] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const formatDate = (iso: string): string => {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  };

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

  const dayTypeLabel: Record<ShootingDayView["dayType"], string> = {
    shoot: "",
    travel: "viaggio",
    rest: "riposo",
    prep: "prep",
  };

  return (
    <div className={styles.column} data-testid={`day-column-${day.dayNumber}`}>
      <div
        className={styles.header}
        onClick={() => onDayClick(day.id)}
        title="Apri dettagli giorno"
      >
        <div className={styles.headerTop}>
          <span
            className={styles.dayNumber}
            data-testid={`day-header-${day.dayNumber}`}
          >
            Gg {day.dayNumber}
          </span>
          {day.dayType !== "shoot" && (
            <span className={styles.dayTypeBadge} data-type={day.dayType}>
              {dayTypeLabel[day.dayType]}
            </span>
          )}
          <span className={styles.hoursIndicator}>
            {day.totalHours % 1 === 0
              ? `${day.totalHours}h`
              : `${day.totalHours.toFixed(1)}h`}
          </span>
          <button
            type="button"
            className={styles.removeBtn}
            title="Rimuovi giorno"
            data-testid={`remove-day-${day.dayNumber}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(day.id);
            }}
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>
        <div
          className={styles.dateWrap}
          onClick={(e) => e.stopPropagation()}
        >
          {isEditingDate || day.date ? (
            <>
              <input
                ref={dateInputRef}
                type="date"
                className={styles.dateInput}
                value={day.date ?? ""}
                data-testid={`day-date-${day.dayNumber}`}
                hidden={!isEditingDate}
                onChange={(e) =>
                  onDateChange(day.id, e.target.value || null)
                }
                onBlur={() => setIsEditingDate(false)}
              />
              {!isEditingDate && day.date && (
                <button
                  type="button"
                  className={styles.dateDisplay}
                  onClick={openDatePicker}
                  aria-label="Modifica data"
                  title="Modifica data"
                >
                  <span>{formatDate(day.date)}</span>
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
              aria-label="Imposta data"
            >
              <Calendar size={12} strokeWidth={2} aria-hidden="true" />
              <span>Imposta data</span>
            </button>
          )}
        </div>
        <PageCountBar pages={day.totalPageCount} />
      </div>

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
    </div>
  );
}
