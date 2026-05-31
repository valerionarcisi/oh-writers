import { useMemo } from "react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
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

const CATEGORY_LABELS: Record<WeeklyCategory, string> = {
  cast: "Cast",
  crew: "Troupe",
  locations: "Location",
  vehicles: "Veicoli",
  other: "Altro",
  contingency: "Imprevisti",
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
  const { data: weeks } = useQuery(weeklyQueryOptions(projectId));

  const buckets = weeks ?? [];

  if (buckets.length === 0) {
    return (
      <div className={styles.root} data-testid="budget-weekly-view">
        <div className={styles.empty}>
          Genera lo schedule e il budget per vedere la ripartizione settimanale.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="budget-weekly-view">
      <div
        className={styles.timeline}
        role="region"
        aria-label="Timeline settimane di produzione"
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
          Settimana {week.weekNumber} · {week.dayCount} giornate
        </span>
        <span className={styles.weekRange}>
          {formatDateRange(week.startDate, week.endDate)}
        </span>
      </header>

      <div className={styles.weekTotal}>{formatCents(week.totalCents)}</div>

      <div
        className={styles.weekBar}
        role="img"
        aria-label={`Ripartizione costi settimana ${week.weekNumber}`}
      >
        {segments.map((seg) => (
          <span
            key={seg.cat}
            className={styles.weekBarSegment}
            style={{
              width: `${seg.percent}%`,
              ["--segment-color" as string]: `var(${CATEGORY_VAR[seg.cat]})`,
            }}
            title={`${CATEGORY_LABELS[seg.cat]} — ${formatCents(seg.value)}`}
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
            <span>{CATEGORY_LABELS[seg.cat]}</span>
          </li>
        ))}
      </ul>

      {week.sceneIds.length > 0 && (
        <div className={styles.weekScenes}>
          <span className={styles.sceneChip}>{week.sceneIds.length} scene</span>
        </div>
      )}
    </article>
  );
}

interface WeeklyTableProps {
  readonly buckets: ReadonlyArray<WeekBucket>;
}

function WeeklyTable({ buckets }: WeeklyTableProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Settimana</th>
            {WEEKLY_CATEGORIES.map((cat) => (
              <th key={cat} scope="col">
                {CATEGORY_LABELS[cat]}
              </th>
            ))}
            <th scope="col">Totale</th>
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
            <th scope="row">Totale</th>
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
