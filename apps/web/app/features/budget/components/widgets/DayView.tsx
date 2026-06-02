import { useState } from "react";
import type { DayCost } from "~/features/budget/server/budget.server";
import { useTranslation } from "~/features/i18n";
import styles from "./DayView.module.css";

const fmt = (n: number) =>
  n.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

interface DayViewProps {
  days: DayCost[];
}

export function DayView({ days }: DayViewProps) {
  const { t } = useTranslation();
  const [openDayId, setOpenDayId] = useState<string | null>(null);

  if (days.length === 0) {
    return <div className={styles.empty}>{t("budget.empty.day")}</div>;
  }

  const maxTotal = Math.max(...days.map((d) => d.total), 1);
  const avgTotal = days.reduce((s, d) => s + d.total, 0) / days.length;

  return (
    <div className={styles.root}>
      {days.map((day) => {
        const isExpensive = day.total > avgTotal * 1.5;
        const isOpen = openDayId === day.dayId;
        const barWidth = Math.round((day.total / maxTotal) * 100);

        return (
          <div
            key={day.dayId}
            className={`${styles.dayCard} ${isExpensive ? styles.expensive : ""}`}
          >
            <div
              className={styles.dayHeader}
              onClick={() => setOpenDayId(isOpen ? null : day.dayId)}
            >
              <span
                className={`${styles.dayNum} ${isExpensive ? styles.warn : ""}`}
              >
                {isExpensive ? "⚠ " : ""}
                {t("budget.day.dayPrefix").replace(
                  "{number}",
                  String(day.dayNumber),
                )}
              </span>
              <div className={styles.bar}>
                <div
                  className={`${styles.barFill} ${isExpensive ? styles.warn : ""}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span
                className={`${styles.dayTotal} ${isExpensive ? styles.warn : ""}`}
              >
                {fmt(day.total)}
              </span>
              <span className={`${styles.arrow} ${isOpen ? styles.open : ""}`}>
                ▾
              </span>
            </div>

            {isOpen && (
              <div className={styles.dayBody}>
                <table className={styles.breakdownTable}>
                  <tbody>
                    <tr>
                      <td>{t("budget.day.cast")}</td>
                      <td>{fmt(day.breakdown.cast)}</td>
                    </tr>
                    <tr>
                      <td>{t("budget.day.crew")}</td>
                      <td>{fmt(day.breakdown.crew)}</td>
                    </tr>
                    {day.breakdown.locations > 0 && (
                      <tr>
                        <td>{t("budget.day.locations")}</td>
                        <td>{fmt(day.breakdown.locations)}</td>
                      </tr>
                    )}
                    {day.breakdown.vehicles > 0 && (
                      <tr>
                        <td>{t("budget.day.vehicles")}</td>
                        <td>{fmt(day.breakdown.vehicles)}</td>
                      </tr>
                    )}
                    {day.breakdown.other > 0 && (
                      <tr>
                        <td>{t("budget.day.other")}</td>
                        <td>{fmt(day.breakdown.other)}</td>
                      </tr>
                    )}
                    <tr>
                      <td>{t("budget.day.contingency")}</td>
                      <td>{fmt(day.breakdown.contingency)}</td>
                    </tr>
                    <tr className={styles.totalRow}>
                      <td>{t("budget.day.total")}</td>
                      <td>{fmt(day.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
