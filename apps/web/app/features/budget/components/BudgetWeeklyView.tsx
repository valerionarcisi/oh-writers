import { useMemo } from "react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
import type { TranslationKey } from "@oh-writers/domain";
import {
  getBudgetWeeklyOverview,
  type WeekBucket,
} from "../server/budget.server";
import styles from "./BudgetWeeklyView.module.css";

// Mirror the category buckets emitted by `aggregateProductionLinesByWeek`.
const WEEKLY_CATEGORIES = [
  "cast",
  "crew",
  "locations",
  "vehicles",
  "other",
  "contingency",
] as const;

type WeeklyCategory = (typeof WEEKLY_CATEGORIES)[number];

const CATEGORY_LABEL_KEYS: Record<WeeklyCategory, TranslationKey> = {
  cast: "budget.weekly.cat.cast",
  crew: "budget.weekly.cat.crew",
  locations: "budget.weekly.cat.locations",
  vehicles: "budget.weekly.cat.vehicles",
  other: "budget.weekly.cat.other",
  contingency: "budget.weekly.cat.contingency",
};

const CATEGORY_VAR: Record<WeeklyCategory, string> = {
  cast: "--ds-cat-cast",
  crew: "--ds-cat-crew",
  locations: "--ds-cat-locations",
  vehicles: "--ds-cat-vehicles",
  other: "--ds-cat-other",
  contingency: "--ds-cat-contingency",
};

const weeklyQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["budget-weekly", projectId],
    queryFn: () =>
      getBudgetWeeklyOverview({ data: { projectId } }).then(unwrapResult),
  });

const MONTH_LABELS_IT = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
];

const formatDateRange = (startISO: string, endISO: string): string => {
  const [, sm, sd] = startISO.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [, em, ed] = endISO.split("-").map(Number) as [number, number, number];
  if (startISO === endISO) return `${sd} ${MONTH_LABELS_IT[sm - 1]}`;
  if (sm === em) return `${sd}–${ed} ${MONTH_LABELS_IT[sm - 1]}`;
  return `${sd} ${MONTH_LABELS_IT[sm - 1]} – ${ed} ${MONTH_LABELS_IT[em - 1]}`;
};

const formatCents = (cents: number): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

interface BudgetWeeklyViewProps {
  readonly projectId: string;
}

export function BudgetWeeklyView({ projectId }: BudgetWeeklyViewProps) {
  const { t } = useTranslation();
  const { data: weeks } = useQuery(weeklyQueryOptions(projectId));

  const buckets = weeks ?? [];

  if (buckets.length === 0) {
    return (
      <div className={styles.root} data-testid="budget-weekly-view">
        <div className={styles.empty}>{t("budget.empty.weekly")}</div>
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="budget-weekly-view">
      <div
        className={styles.timeline}
        role="region"
        aria-label={t("budget.weekly.timelineAriaLabel")}
      >
        {buckets.map((week) => (
          <WeekCard key={week.weekNumber} week={week} />
        ))}
      </div>

      <WeeklyTable buckets={buckets} />
    </div>
  );
}

interface WeekCardProps {
  readonly week: WeekBucket;
}

function WeekCard({ week }: WeekCardProps) {
  const { t } = useTranslation();
  const segments = useMemo(() => {
    return WEEKLY_CATEGORIES.map((cat) => {
      const entry = week.linesByCategory[cat];
      const value = entry?.totalCents ?? 0;
      if (week.totalCents === 0) return { cat, value, percent: 0 };
      return {
        cat,
        value,
        percent: (value / week.totalCents) * 100,
      };
    }).filter((s) => s.value > 0);
  }, [week]);

  return (
    <article className={styles.weekCard} data-testid="budget-week-card">
      <header className={styles.weekHeader}>
        <span className={styles.weekTitle}>
          {t("budget.weekly.weekTitle")
            .replace("{number}", String(week.weekNumber))
            .replace("{days}", String(week.dayCount))}
        </span>
        <span className={styles.weekRange}>
          {formatDateRange(week.startDate, week.endDate)}
        </span>
      </header>

      <div className={styles.weekTotal}>{formatCents(week.totalCents)}</div>

      <div
        className={styles.weekBar}
        role="img"
        aria-label={t("budget.weekly.weekBarAriaLabel").replace(
          "{number}",
          String(week.weekNumber),
        )}
      >
        {segments.map((seg) => (
          <span
            key={seg.cat}
            className={styles.weekBarSegment}
            style={{
              width: `${seg.percent}%`,
              ["--segment-color" as string]: `var(${CATEGORY_VAR[seg.cat]})`,
            }}
            title={`${t(CATEGORY_LABEL_KEYS[seg.cat])} — ${formatCents(seg.value)}`}
          />
        ))}
      </div>

      <ul className={styles.weekLegend}>
        {segments.map((seg) => (
          <li key={seg.cat} className={styles.legendDot}>
            <span
              className={styles.legendDotSwatch}
              style={{
                ["--segment-color" as string]: `var(${CATEGORY_VAR[seg.cat]})`,
              }}
              aria-hidden="true"
            />
            <span>{t(CATEGORY_LABEL_KEYS[seg.cat])}</span>
          </li>
        ))}
      </ul>

      {week.sceneIds.length > 0 && (
        <div className={styles.weekScenes}>
          <span className={styles.sceneChip}>
            {t("budget.weekly.scenes").replace(
              "{count}",
              String(week.sceneIds.length),
            )}
          </span>
        </div>
      )}
    </article>
  );
}

interface WeeklyTableProps {
  readonly buckets: ReadonlyArray<WeekBucket>;
}

function WeeklyTable({ buckets }: WeeklyTableProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("budget.weekly.colWeek")}</th>
            {WEEKLY_CATEGORIES.map((cat) => (
              <th key={cat} scope="col">
                {t(CATEGORY_LABEL_KEYS[cat])}
              </th>
            ))}
            <th scope="col">{t("budget.weekly.colTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((week) => (
            <tr key={week.weekNumber}>
              <th scope="row">S{week.weekNumber}</th>
              {WEEKLY_CATEGORIES.map((cat) => {
                const cents = week.linesByCategory[cat]?.totalCents ?? 0;
                return (
                  <td key={cat}>{cents > 0 ? formatCents(cents) : "—"}</td>
                );
              })}
              <td>{formatCents(week.totalCents)}</td>
            </tr>
          ))}
          <tr className={styles.totalRow}>
            <th scope="row">{t("budget.weekly.rowTotal")}</th>
            {WEEKLY_CATEGORIES.map((cat) => {
              const sum = buckets.reduce(
                (acc, w) => acc + (w.linesByCategory[cat]?.totalCents ?? 0),
                0,
              );
              return <td key={cat}>{sum > 0 ? formatCents(sum) : "—"}</td>;
            })}
            <td>
              {formatCents(buckets.reduce((acc, w) => acc + w.totalCents, 0))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
