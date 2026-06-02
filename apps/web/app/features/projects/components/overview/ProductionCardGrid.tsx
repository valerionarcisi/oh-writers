import { Link } from "@tanstack/react-router";
import type {
  BreakdownSummary,
  BudgetSummary,
  ScheduleSummary,
  LocationsSummary,
} from "../../server/project-overview.server";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./ProductionCardGrid.module.css";

type Translate = (key: TranslationKey) => string;

interface ProductionCardGridProps {
  readonly projectId: string;
  readonly breakdown: BreakdownSummary;
  readonly budget: BudgetSummary;
  readonly schedule: ScheduleSummary;
  readonly locations: LocationsSummary;
}

type ProdRoute =
  | "/projects/$id/breakdown"
  | "/projects/$id/budget"
  | "/projects/$id/schedule"
  | "/projects/$id/locations";

interface ProdCardData {
  readonly key: string;
  readonly eyebrow: string;
  readonly value: string;
  readonly unit: string | null;
  readonly sub: string;
  readonly progressPct: number;
  readonly progressLabel: string;
  readonly route: ProdRoute;
}

const formatEUR = (n: number): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const buildCards = (
  breakdown: BreakdownSummary,
  budget: BudgetSummary,
  schedule: ScheduleSummary,
  locations: LocationsSummary,
  t: Translate,
): ProdCardData[] => {
  const breakdownPct =
    breakdown.totalScenes > 0
      ? Math.round((breakdown.scenesBrokenDown / breakdown.totalScenes) * 100)
      : 0;
  return [
    {
      key: "breakdown",
      eyebrow: t("nav.breakdown"),
      value: String(breakdown.scenesBrokenDown),
      unit: `/ ${breakdown.totalScenes} ${t("projects.production.scenesUnit")}`,
      sub:
        breakdown.scenesBrokenDown === 0
          ? t("projects.production.noScenesBrokenDown")
          : `${breakdown.scenesBrokenDown} ${t("projects.production.scenesBrokenDown")}`,
      progressPct: breakdownPct,
      progressLabel:
        breakdown.scenesBrokenDown === 0
          ? `0${t("projects.production.startBreakdown")}`
          : `${breakdownPct}${t("projects.production.continueBreakdown")}`,
      route: "/projects/$id/breakdown",
    },
    {
      key: "budget",
      eyebrow: t("nav.budget"),
      value: budget.hasAny ? formatEUR(budget.totalEUR) : "—",
      unit: null,
      sub: budget.hasAny
        ? `${budget.lineCount} ${t("projects.production.budgetLines")} ${budget.status}`
        : t("projects.production.budgetAfterBreakdown"),
      progressPct: budget.hasAny ? (budget.status === "locked" ? 100 : 50) : 0,
      progressLabel: budget.hasAny
        ? budget.status === "locked"
          ? t("projects.production.locked")
          : t("projects.production.draft")
        : t("projects.production.waiting"),
      route: "/projects/$id/budget",
    },
    {
      key: "schedule",
      eyebrow: t("projects.pipeline.scheduling"),
      value: schedule.hasAny ? String(schedule.shootingDayCount) : "—",
      unit: schedule.hasAny ? t("projects.production.daysUnit") : null,
      sub: schedule.hasAny
        ? `${Math.round(schedule.totalHours)} h · ${schedule.scheduledScenes} ${t("projects.production.scenesUnit")}`
        : t("projects.production.scheduleAfterBudget"),
      progressPct:
        schedule.totalScenes > 0
          ? Math.round((schedule.scheduledScenes / schedule.totalScenes) * 100)
          : 0,
      progressLabel: schedule.hasAny
        ? t("projects.production.draft")
        : t("projects.production.waiting"),
      route: "/projects/$id/schedule",
    },
    {
      key: "locations",
      eyebrow: t("nav.locations"),
      value: locations.hasAny ? String(locations.confirmedCount) : "—",
      unit: locations.hasAny ? `/ ${locations.totalRequirements}` : null,
      sub: locations.hasAny
        ? `${locations.confirmedCount} ${t("projects.production.confirmedOf")} ${locations.totalRequirements}`
        : t("projects.production.syncFromBreakdown"),
      progressPct:
        locations.totalRequirements > 0
          ? Math.round(
              (locations.confirmedCount / locations.totalRequirements) * 100,
            )
          : 0,
      progressLabel: locations.hasAny
        ? `${locations.confirmedCount} / ${locations.totalRequirements} ${t("projects.production.confirmed")}`
        : t("projects.production.waiting"),
      route: "/projects/$id/locations",
    },
  ];
};

export function ProductionCardGrid({
  projectId,
  breakdown,
  budget,
  schedule,
  locations,
}: ProductionCardGridProps) {
  const { t } = useTranslation();
  const cards = buildCards(breakdown, budget, schedule, locations, t);

  return (
    <section
      className={styles.section}
      aria-labelledby="overview-production-h"
    >
      <div className={styles.head}>
        <h2 id="overview-production-h" className={styles.title}>
          {t("projects.production.heading")}
        </h2>
        <span className={styles.meta}>
          {t("projects.production.subtitle")}
        </span>
      </div>
      <div className={styles.grid}>
        {cards.map((c) => {
          const isBudget = c.key === "budget";
          const showAiBadge =
            isBudget && budget.hasAny && budget.status === "estimated";
          return (
            <Link
              key={c.key}
              to={c.route}
              params={{ id: projectId }}
              className={
                isBudget
                  ? `${styles.card} ${styles.budgetCard}`
                  : styles.card
              }
            >
              <div className={styles.eyebrow}>{c.eyebrow}</div>
              <div className={styles.valueRow}>
                <div
                  className={
                    isBudget
                      ? `${styles.value} ${styles.budgetValue}`
                      : styles.value
                  }
                >
                  {c.value}
                  {c.unit && <span className={styles.unit}>{c.unit}</span>}
                </div>
                {showAiBadge && (
                  <span
                    className={styles.aiBadge}
                    aria-label={t("projects.production.aiEstimate")}
                  >
                    AI
                  </span>
                )}
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
            </Link>
          );
        })}
      </div>
    </section>
  );
}
