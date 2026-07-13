import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@oh-writers/ui";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import {
  aiUsageStatsQueryOptions,
  type AiUsageBreakdownRow,
} from "../ai-usage-stats.server";
import { AiUsageChart } from "./AiUsageChart";
import styles from "./AiUsageStats.module.css";

// Token/cost usage statistics (live request 2026-07-13): 30-day totals plus
// per-model and per-operation breakdowns from the Spec 83 `ai_usage` ledger,
// with the 14-day daily chart. Rendered INLINE in /settings/ai below the
// provider card — one page for everything AI, no separate stats route.
export function AiUsageStats() {
  const { t } = useTranslation();
  const statsQuery = useQuery(aiUsageStatsQueryOptions());
  const stats = statsQuery.data;

  return (
    <div className={styles.page} data-testid="ai-usage-stats">
      <h2 className={styles.title}>{t("settings.ai.stats.pageTitle")}</h2>

      {statsQuery.isLoading || !stats ? (
        <Skeleton
          lines={6}
          widths={["40%", "100%", "90%", "100%", "80%", "60%"]}
          tone="agent"
          ariaLabel={t("settings.ai.stats.pageTitle")}
        />
      ) : (
        <>
          <div className={styles.totalsRow}>
            <TotalTile
              label={t("settings.ai.stats.totalCost")}
              value={`$${stats.totals.costUsd.toFixed(2)}`}
            />
            <TotalTile
              label={t("settings.ai.stats.totalCalls")}
              value={String(stats.totals.calls)}
            />
            <TotalTile
              label={t("settings.ai.stats.totalInputTokens")}
              value={formatTokens(stats.totals.inputTokens)}
            />
            <TotalTile
              label={t("settings.ai.stats.totalOutputTokens")}
              value={formatTokens(stats.totals.outputTokens)}
            />
          </div>

          <AiUsageChart />

          <BreakdownTable
            title={t("settings.ai.stats.byModel")}
            rows={stats.byModel}
            t={t}
          />
          <BreakdownTable
            title={t("settings.ai.stats.byOperation")}
            rows={stats.byOperation}
            t={t}
          />

          {stats.totals.calls === 0 && (
            <p className={styles.empty}>{t("settings.ai.stats.empty")}</p>
          )}
        </>
      )}
    </div>
  );
}

function TotalTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  t,
}: {
  title: string;
  rows: AiUsageBreakdownRow[];
  t: (key: TranslationKey) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thLeft}>{t("settings.ai.stats.colKey")}</th>
            <th>{t("settings.ai.stats.colCalls")}</th>
            <th>{t("settings.ai.stats.colInput")}</th>
            <th>{t("settings.ai.stats.colOutput")}</th>
            <th>{t("settings.ai.stats.colCost")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className={styles.tdKey}>{row.key}</td>
              <td>{row.calls}</td>
              <td>{formatTokens(row.inputTokens)}</td>
              <td>{formatTokens(row.outputTokens)}</td>
              <td>${row.costUsd.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const formatTokens = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);
