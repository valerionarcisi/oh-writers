import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "~/features/i18n";
import {
  aiUsageDailyQueryOptions,
  type AiUsageDay,
} from "../ai-usage-stats.server";
import styles from "./AiUsageChart.module.css";

// 14-day AI spend bar chart (live request 2026-07-13). Pure CSS bars from the
// Spec 83 `ai_usage` ledger — no chart dependency for one metric. Hidden
// entirely when the window has no spend (a fresh BYOK user sees the connect
// card, not an empty chart).
const WINDOW_DAYS = 14;

const lastNDays = (n: number): string[] => {
  const days: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
};

export function AiUsageChart() {
  const { t } = useTranslation();
  const usageQuery = useQuery(aiUsageDailyQueryOptions());

  const rows = usageQuery.data ?? [];
  if (rows.length === 0) return null;

  const byDay = new Map(rows.map((r: AiUsageDay) => [r.day, r.costUsd]));
  const days = lastNDays(WINDOW_DAYS);
  const max = Math.max(...days.map((d) => byDay.get(d) ?? 0), 0.000001);
  const total = rows.reduce((sum, r) => sum + r.costUsd, 0);

  return (
    <section className={styles.section} data-testid="ai-usage-chart">
      <div className={styles.header}>
        <h2 className={styles.title}>{t("settings.ai.usage.title")}</h2>
        <span className={styles.total}>
          {t("settings.ai.usage.total").replace("{n}", total.toFixed(2))}
        </span>
      </div>
      <div
        className={styles.bars}
        role="img"
        aria-label={t("settings.ai.usage.title")}
      >
        {days.map((day) => {
          const cost = byDay.get(day) ?? 0;
          return (
            <div key={day} className={styles.barCol}>
              <div
                className={styles.bar}
                style={{ blockSize: `${Math.round((cost / max) * 100)}%` }}
                title={`${day} · $${cost.toFixed(3)}`}
              />
              <span className={styles.dayLabel}>{day.slice(8)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
