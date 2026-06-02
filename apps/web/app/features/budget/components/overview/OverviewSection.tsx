import type {
  BudgetOverview,
  BudgetCategoryKey,
} from "../../server/budget-helpers";
import { useTranslation } from "~/features/i18n";
import { CategoryDonut, type DonutSegment } from "../charts/CategoryDonut";
import { DepartmentBar, type BarDatum } from "../charts/DepartmentBar";
import { Sparkline } from "../charts/Sparkline";
import styles from "./OverviewSection.module.css";

const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurAmount = (n: number) => eur.format(Math.round(n));

const eurCompact = (n: number) => {
  if (n >= 1_000_000) return `€ ${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `€ ${Math.round(n / 1_000)} K`;
  return eurAmount(n);
};

const formatDelta = (pct: number): string =>
  `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;

interface OverviewSectionProps {
  readonly overview: BudgetOverview;
  readonly onDrillDown: (categoryId: BudgetCategoryKey) => void;
}

interface StatusBadgeProps {
  readonly status: "ok" | "warn" | "missing" | "locked";
  readonly reason: string | null;
}

function StatusBadge({ status, reason }: StatusBadgeProps) {
  const { t } = useTranslation();
  const label =
    status === "ok"
      ? t("budget.overview.statusComplete")
      : status === "warn"
        ? (reason ?? t("budget.overview.statusToConfirm"))
        : status === "missing"
          ? (reason ?? t("budget.overview.statusNoRate"))
          : t("budget.overview.statusLocked");
  return (
    <span
      className={styles.statusBadge}
      data-status={status}
      aria-label={t("budget.overview.statusBadgeAriaLabel").replace(
        "{label}",
        label,
      )}
    >
      <span className={styles.statusDot} aria-hidden="true" />
      {label}
    </span>
  );
}

export function OverviewSection({
  overview,
  onDrillDown,
}: OverviewSectionProps) {
  const { t } = useTranslation();
  const donutSegments: DonutSegment[] = overview.categories
    .filter((c) => c.total > 0)
    .map((c) => ({
      id: c.id,
      label: c.label,
      value: c.total,
      colorVar: c.colorVar,
    }));

  const topDepartments: BarDatum[] = overview.categories
    .filter((c) => c.total > 0)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      label: c.label,
      value: c.total,
      formattedValue: eurCompact(c.total),
      percent: c.percent,
      colorVar: c.colorVar,
    }));

  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <div className={styles.heroTotal}>
          <div className={styles.eyebrow}>
            {t("budget.overview.estimatedTotal")}
          </div>
          <div className={styles.heroValue}>
            {eurAmount(overview.grandTotal)}
          </div>
          {overview.deltaPercent !== null && (
            <span
              className={styles.delta}
              data-direction={overview.deltaPercent > 0 ? "neg" : "pos"}
            >
              {t("budget.overview.deltaVsEstimate").replace(
                "{delta}",
                formatDelta(overview.deltaPercent),
              )}
            </span>
          )}
          <div className={styles.heroSub}>
            {t("budget.overview.contingencyIncluded").replace(
              "{percent}",
              String(
                overview.grandTotal > 0
                  ? Math.round(
                      (overview.contingencyAmount / overview.grandTotal) * 100,
                    )
                  : 0,
              ),
            )}
            {overview.shootingDays
              ? t("budget.overview.days").replace(
                  "{days}",
                  String(overview.shootingDays),
                )
              : ""}
            {overview.perDay !== null
              ? t("budget.overview.perDayInline").replace(
                  "{amount}",
                  eurCompact(overview.perDay),
                )
              : ""}
          </div>
        </div>

        <div className={styles.heroDonut}>
          <CategoryDonut
            segments={donutSegments}
            total={overview.grandTotal}
            centerLabel={eurCompact(overview.grandTotal)}
            centerSub={t("budget.overview.categoriesCount").replace(
              "{count}",
              String(overview.categories.length),
            )}
          />
        </div>

        <dl className={styles.kpis}>
          <KpiCell
            kind="cast"
            label={t("budget.overview.kpiCast")}
            value={eurCompact(overview.castTotal)}
            foot={`${overview.castTotal > 0 ? Math.round((overview.castTotal / overview.grandTotal) * 100) : 0}% · ${overview.categories.find((c) => c.id === "cast")?.resourceCount ?? 0} ${t("budget.overview.roles")}`}
          />
          <KpiCell
            kind="crew"
            label={t("budget.overview.kpiCrew")}
            value={eurCompact(overview.crewTotal)}
            foot={`${overview.crewTotal > 0 ? Math.round((overview.crewTotal / overview.grandTotal) * 100) : 0}% · ${overview.categories.find((c) => c.id === "crew")?.resourceCount ?? 0} ${t("budget.overview.roles")}`}
          />
          <KpiCell
            kind="prod"
            label={t("budget.overview.kpiProduction")}
            value={eurCompact(overview.productionTotal)}
            foot={`${overview.grandTotal > 0 ? Math.round((overview.productionTotal / overview.grandTotal) * 100) : 0}% · ${overview.categories.filter((c) => c.id !== "cast" && c.id !== "crew").length} ${t("budget.overview.repartiCount")}`}
          />
          <KpiCell
            kind="cont"
            label={t("budget.overview.kpiContingency")}
            value={eurCompact(overview.contingencyAmount)}
            foot={`${overview.grandTotal > 0 ? Math.round((overview.contingencyAmount / overview.grandTotal) * 100) : 0}% ${t("budget.overview.contingencyShort")}`}
          />
          <KpiCell
            kind="days"
            label={t("budget.overview.kpiPerDay")}
            value={overview.perDay !== null ? eurCompact(overview.perDay) : "—"}
            foot={
              overview.shootingDays
                ? t("budget.overview.daysShort").replace(
                    "{days}",
                    String(overview.shootingDays),
                  )
                : t("budget.overview.notAvailable")
            }
          />
          <KpiCell
            kind="scene"
            label={t("budget.overview.kpiPerScene")}
            value={
              overview.perScene !== null ? eurCompact(overview.perScene) : "—"
            }
            foot={
              overview.sceneCount > 0
                ? t("budget.overview.sceneAverage").replace(
                    "{count}",
                    String(overview.sceneCount),
                  )
                : t("budget.overview.notAvailable")
            }
          />
        </dl>
      </section>

      <section className={styles.split}>
        <div className={styles.card}>
          <header className={styles.cardHead}>
            <span className={styles.cardTitle}>
              {t("budget.overview.spendDistribution")}
            </span>
            <span className={styles.cardMeta}>
              {t("budget.overview.top5")}
            </span>
          </header>
          <DepartmentBar data={topDepartments} />
        </div>
        <div className={styles.card}>
          <header className={styles.cardHead}>
            <span className={styles.cardTitle}>
              {t("budget.overview.budgetStatus")}
            </span>
            <span className={styles.cardMeta}>
              {t("budget.overview.warnings").replace(
                "{count}",
                String(overview.missingRatesCount),
              )}
            </span>
          </header>
          <ul className={styles.alerts}>
            {overview.missingRatesCount > 0 && (
              <li className={styles.alert} data-tone="warn">
                <div className={styles.alertTag}>
                  {t("budget.overview.missingRatesTag")}
                </div>
                <div>
                  <strong>
                    {t("budget.overview.actorsNoDayRate").replace(
                      "{count}",
                      String(overview.missingRatesCount),
                    )}
                  </strong>
                  {t("budget.overview.setRatesToAvoidZero")}
                </div>
              </li>
            )}
            {overview.categories
              .filter((c) => c.status === "missing")
              .map((c) => (
                <li key={c.id} className={styles.alert} data-tone="info">
                  <div className={styles.alertTag}>{c.label}</div>
                  <div>
                    <strong>{t("budget.overview.noRateTag")}</strong>
                    {t("budget.overview.categoryInBreakdown")}
                  </div>
                </li>
              ))}
            {overview.missingRatesCount === 0 &&
              overview.categories.every((c) => c.status !== "missing") && (
                <li className={styles.alert} data-tone="ok">
                  <div className={styles.alertTag}>
                    {t("budget.overview.readyTag")}
                  </div>
                  <div>
                    <strong>{t("budget.overview.allCovered")}</strong>
                    {t("budget.overview.readyForLock")}
                  </div>
                </li>
              )}
          </ul>
        </div>
      </section>

      <section className={styles.catsSection}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>
            {t("budget.overview.departments")}
          </h2>
          <span className={styles.sectionMeta}>
            {t("budget.section.departmentsMeta").replace(
              "{count}",
              String(overview.categories.length),
            )}
          </span>
        </header>
        <div className={styles.cats}>
          {overview.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.cat}
              style={{ ["--cat-color" as string]: `var(${c.colorVar})` }}
              onClick={() => onDrillDown(c.id)}
              data-testid={`category-card-${c.id}`}
              aria-label={t("budget.overview.openDetail").replace(
                "{category}",
                c.label,
              )}
            >
              <div className={styles.catTop}>
                <span className={styles.catName}>{c.label}</span>
                <span className={styles.catShare}>{c.percent.toFixed(0)}%</span>
              </div>
              <div className={styles.catAmount}>
                {c.total > 0 ? eurCompact(c.total) : "—"}
              </div>
              <Sparkline
                values={c.sparkline}
                colorVar={c.colorVar}
                ariaLabel={t("budget.overview.trend").replace(
                  "{category}",
                  c.label,
                )}
              />
              <div className={styles.catFoot}>
                <span>
                  {c.resourceCount}{" "}
                  {c.id === "cast" || c.id === "crew"
                    ? t("budget.overview.rolesCount")
                    : t("budget.overview.linesCount")}
                </span>
                <StatusBadge status={c.status} reason={c.statusReason} />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

interface KpiCellProps {
  readonly kind: "cast" | "crew" | "prod" | "cont" | "days" | "scene";
  readonly label: string;
  readonly value: string;
  readonly foot: string;
}

function KpiCell({ kind, label, value, foot }: KpiCellProps) {
  return (
    <div className={styles.kpi} data-kind={kind}>
      <dt className={styles.kpiLabel}>{label}</dt>
      <dd className={styles.kpiValue}>{value}</dd>
      <dd className={styles.kpiFoot}>{foot}</dd>
    </div>
  );
}
