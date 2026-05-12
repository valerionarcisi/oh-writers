import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { DAILY_CAPACITY_HOURS } from "@oh-writers/domain";
import type { ShootingDayView } from "../server/schedule.server";
import styles from "./ShootingDayDrawer.module.css";

interface ShootingDayDrawerProps {
  day: ShootingDayView | null;
  onClose: () => void;
  onEffortChange: (stripId: string, estimatedHours: number | null) => void;
}

const DAY_TYPE_LABEL: Record<ShootingDayView["dayType"], string> = {
  shoot: "Riprese",
  travel: "Viaggio",
  rest: "Riposo",
  prep: "Prep",
};

const capacityColor = (hours: number): "green" | "yellow" | "red" => {
  if (hours <= DAILY_CAPACITY_HOURS) return "green";
  if (hours <= DAILY_CAPACITY_HOURS * 1.25) return "yellow";
  return "red";
};

export function ShootingDayDrawer({
  day,
  onClose,
  onEffortChange,
}: ShootingDayDrawerProps) {
  // Local input state: stripId → string value (empty = auto)
  const [inputs, setInputs] = useState<Record<string, string>>({});

  // Sync input state when day changes
  useEffect(() => {
    if (!day) return;
    const next: Record<string, string> = {};
    for (const strip of day.strips) {
      next[strip.id] =
        strip.estimatedHours != null ? String(strip.estimatedHours) : "";
    }
    setInputs(next);
  }, [day?.id, day?.strips.length]);

  const handleBlur = (stripId: string, autoHours: number) => {
    const raw = inputs[stripId] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "") {
      onEffortChange(stripId, null);
      return;
    }
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed < 0.5 || parsed > 24) {
      // Reset to last saved value
      const strip = day!.strips.find((s) => s.id === stripId);
      setInputs((prev) => ({
        ...prev,
        [stripId]:
          strip?.estimatedHours != null ? String(strip.estimatedHours) : "",
      }));
      return;
    }
    // Round to nearest 0.5
    const rounded = Math.round(parsed * 2) / 2;
    setInputs((prev) => ({ ...prev, [stripId]: String(rounded) }));
    onEffortChange(
      stripId,
      rounded === autoHours &&
        day!.strips.find((s) => s.id === stripId)?.estimatedHours === null
        ? null
        : rounded,
    );
  };

  const totalHours = day?.totalHours ?? 0;
  const barColor = capacityColor(totalHours);
  const barWidth = Math.min((totalHours / DAILY_CAPACITY_HOURS) * 100, 100);

  return (
    <div
      className={`${styles.backdrop} ${day ? styles.open : ""}`}
      onClick={onClose}
    >
      <aside
        className={`${styles.drawer} ${day ? styles.open : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.dayLabel}>
            {day ? `Giorno ${day.dayNumber}` : ""}
          </div>
          <div className={styles.headerMeta}>
            {day?.date && (
              <span className={styles.dayDate}>
                {new Date(day.date + "T00:00:00").toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
            {day && (
              <span className={styles.dayTypeBadge} data-type={day.dayType}>
                {DAY_TYPE_LABEL[day.dayType]}
              </span>
            )}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title="Chiudi"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {day && (
          <>
            <div className={styles.capacitySection}>
              <div className={styles.capacityLabel}>
                <span>Capacità giornata</span>
                <span className={styles.capacityValue} data-color={barColor}>
                  {totalHours % 1 === 0
                    ? `${totalHours}h`
                    : `${totalHours.toFixed(1)}h`}{" "}
                  / {DAILY_CAPACITY_HOURS}h
                </span>
              </div>
              <div className={styles.capacityBar}>
                <div
                  className={styles.capacityFill}
                  data-color={barColor}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              {totalHours > DAILY_CAPACITY_HOURS && (
                <div className={styles.overCapacityNote}>
                  +{(totalHours - DAILY_CAPACITY_HOURS).toFixed(1)}h oltre la
                  capacità
                </div>
              )}
            </div>

            <div className={styles.sceneList}>
              {day.strips.length === 0 && (
                <div className={styles.empty}>
                  Nessuna scena in questo giorno.
                </div>
              )}
              {day.strips.map((strip) => {
                const autoHours = strip.pageCount * 1.0;
                const isOverride = strip.estimatedHours != null;
                return (
                  <div key={strip.id} className={styles.sceneRow}>
                    <div
                      className={styles.colorBand}
                      data-color={strip.bannerColor}
                    />
                    <div className={styles.sceneInfo}>
                      <div className={styles.sceneMain}>
                        <span className={styles.sceneNumber}>
                          Sc. {strip.sceneNumber}
                        </span>
                        <span className={styles.sceneLocation}>
                          {strip.location}
                        </span>
                      </div>
                      <div className={styles.scenePages}>
                        {strip.pageCount} pag.
                      </div>
                    </div>
                    <div className={styles.effortCell}>
                      <input
                        type="number"
                        className={`${styles.effortInput} ${isOverride ? styles.overridden : ""}`}
                        min="0.5"
                        max="24"
                        step="0.5"
                        value={inputs[strip.id] ?? ""}
                        placeholder={`${autoHours % 1 === 0 ? autoHours : autoHours.toFixed(1)}h`}
                        onChange={(e) =>
                          setInputs((prev) => ({
                            ...prev,
                            [strip.id]: e.target.value,
                          }))
                        }
                        onBlur={() => handleBlur(strip.id, autoHours)}
                      />
                      {isOverride && (
                        <button
                          type="button"
                          className={styles.clearBtn}
                          title="Ripristina auto"
                          onClick={() => {
                            setInputs((prev) => ({
                              ...prev,
                              [strip.id]: "",
                            }));
                            onEffortChange(strip.id, null);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
