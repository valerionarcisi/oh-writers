import { useNavigate } from "@tanstack/react-router";
import type {
  BreakdownSummary,
  BudgetSummary,
  ScheduleSummary,
} from "../../server/project-overview.server";
import styles from "./ProductionCardGrid.module.css";

interface ProductionCardGridProps {
  readonly projectId: string;
  readonly breakdown: BreakdownSummary;
  readonly budget: BudgetSummary;
  readonly schedule: ScheduleSummary;
}

interface ProdCardData {
  readonly key: string;
  readonly eyebrow: string;
  readonly value: string;
  readonly unit: string | null;
  readonly sub: string;
  readonly progressPct: number;
  readonly progressLabel: string;
  readonly href: string;
}

const formatEUR = (n: number): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const buildCards = (
  projectId: string,
  breakdown: BreakdownSummary,
  budget: BudgetSummary,
  schedule: ScheduleSummary,
): ProdCardData[] => {
  const breakdownPct =
    breakdown.totalScenes > 0
      ? Math.round((breakdown.scenesBrokenDown / breakdown.totalScenes) * 100)
      : 0;
  return [
    {
      key: "breakdown",
      eyebrow: "Breakdown",
      value: String(breakdown.scenesBrokenDown),
      unit: `/ ${breakdown.totalScenes} scene`,
      sub:
        breakdown.scenesBrokenDown === 0
          ? "Nessuna scena spogliata"
          : `${breakdown.scenesBrokenDown} scene spogliate`,
      progressPct: breakdownPct,
      progressLabel:
        breakdown.scenesBrokenDown === 0
          ? "0% — Avvia spoglio"
          : `${breakdownPct}% — Continua spoglio`,
      href: `/projects/${projectId}/breakdown`,
    },
    {
      key: "budget",
      eyebrow: "Budget",
      value: budget.hasAny ? formatEUR(budget.totalEUR) : "—",
      unit: null,
      sub: budget.hasAny
        ? `${budget.lineCount} voci · ${budget.status}`
        : "Da generare dopo breakdown",
      progressPct: budget.hasAny ? (budget.status === "locked" ? 100 : 50) : 0,
      progressLabel: budget.hasAny
        ? budget.status === "locked"
          ? "Bloccato"
          : "In bozza"
        : "In attesa",
      href: `/projects/${projectId}/budget`,
    },
    {
      key: "schedule",
      eyebrow: "Piano di ripresa",
      value: schedule.hasAny ? String(schedule.shootingDayCount) : "—",
      unit: schedule.hasAny ? "giornate" : null,
      sub: schedule.hasAny
        ? `${Math.round(schedule.totalHours)} h · ${schedule.scheduledScenes} scene`
        : "Da generare dopo budget",
      progressPct:
        schedule.totalScenes > 0
          ? Math.round(
              (schedule.scheduledScenes / schedule.totalScenes) * 100,
            )
          : 0,
      progressLabel: schedule.hasAny ? "In bozza" : "In attesa",
      href: `/projects/${projectId}/schedule`,
    },
  ];
};

export function ProductionCardGrid({
  projectId,
  breakdown,
  budget,
  schedule,
}: ProductionCardGridProps) {
  const navigate = useNavigate();
  const cards = buildCards(projectId, breakdown, budget, schedule);

  return (
    <section
      className={styles.section}
      aria-labelledby="overview-production-h"
    >
      <div className={styles.head}>
        <h2 id="overview-production-h" className={styles.title}>
          Produzione
        </h2>
        <span className={styles.meta}>Dati dalla bozza corrente</span>
      </div>
      <div className={styles.grid}>
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            className={styles.card}
            onClick={() => void navigate({ to: c.href } as never)}
          >
            <div className={styles.eyebrow}>{c.eyebrow}</div>
            <div className={styles.value}>
              {c.value}
              {c.unit && <span className={styles.unit}>{c.unit}</span>}
            </div>
            <div className={styles.sub}>{c.sub}</div>
            <div
              className={styles.bar}
              role="progressbar"
              aria-valuenow={c.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={styles.barFill}
                style={{ inlineSize: `${c.progressPct}%` }}
              />
            </div>
            <div className={styles.progress}>{c.progressLabel}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
