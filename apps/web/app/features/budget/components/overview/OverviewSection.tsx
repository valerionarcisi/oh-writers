import type {
  BudgetOverview,
  BudgetCategoryKey,
} from "../../server/budget-helpers";
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
  const label =
    status === "ok"
      ? "Completo"
      : status === "warn"
        ? (reason ?? "Da confermare")
        : status === "missing"
          ? (reason ?? "Senza tariffa")
          : "Locked";
  return (
    <span
      className={styles.statusBadge}
      data-status={status}
      aria-label={`Stato categoria: ${label}`}
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
          <div className={styles.eyebrow}>Totale stimato</div>
          <div className={styles.heroValue}>
            {eurAmount(overview.grandTotal)}
          </div>
          {overview.deltaPercent !== null && (
            <span
              className={styles.delta}
              data-direction={overview.deltaPercent > 0 ? "neg" : "pos"}
            >
              {formatDelta(overview.deltaPercent)} vs preventivo
            </span>
          )}
          <div className={styles.heroSub}>
            contingency {overview.grandTotal > 0
              ? Math.round(
                  (overview.contingencyAmount / overview.grandTotal) * 100,
                )
              : 0}
            % inclusa
            {overview.shootingDays
              ? ` · ${overview.shootingDays} giornate`
              : ""}
            {overview.perDay !== null
              ? ` · ${eurCompact(overview.perDay)}/giorno`
              : ""}
          </div>
        </div>

        <div className={styles.heroDonut}>
          <CategoryDonut
            segments={donutSegments}
            total={overview.grandTotal}
            centerLabel={eurCompact(overview.grandTotal)}
            centerSub={`${overview.categories.length} categorie`}
          />
        </div>

        <dl className={styles.kpis}>
          <KpiCell
            kind="cast"
            label="Cast"
            value={eurCompact(overview.castTotal)}
            foot={`${overview.castTotal > 0 ? Math.round((overview.castTotal / overview.grandTotal) * 100) : 0}% · ${overview.categories.find((c) => c.id === "cast")?.resourceCount ?? 0} ruoli`}
          />
          <KpiCell
            kind="crew"
            label="Troupe"
            value={eurCompact(overview.crewTotal)}
            foot={`${overview.crewTotal > 0 ? Math.round((overview.crewTotal / overview.grandTotal) * 100) : 0}% · ${overview.categories.find((c) => c.id === "crew")?.resourceCount ?? 0} ruoli`}
          />
          <KpiCell
            kind="prod"
            label="Production"
            value={eurCompact(overview.productionTotal)}
            foot={`${overview.grandTotal > 0 ? Math.round((overview.productionTotal / overview.grandTotal) * 100) : 0}% · ${overview.categories.filter((c) => c.id !== "cast" && c.id !== "crew").length} reparti`}
          />
          <KpiCell
            kind="cont"
            label="Contingency"
            value={eurCompact(overview.contingencyAmount)}
            foot={`${overview.grandTotal > 0 ? Math.round((overview.contingencyAmount / overview.grandTotal) * 100) : 0}% imp.`}
          />
          <KpiCell
            kind="days"
            label="Costo / giornata"
            value={overview.perDay !== null ? eurCompact(overview.perDay) : "—"}
            foot={
              overview.shootingDays ? `${overview.shootingDays} gg` : "n/d"
            }
          />
          <KpiCell
            kind="scene"
            label="Costo / scena"
            value={
              overview.perScene !== null ? eurCompact(overview.perScene) : "—"
            }
            foot={
              overview.sceneCount > 0
                ? `media ${overview.sceneCount} scene`
                : "n/d"
            }
          />
        </dl>
      </section>

      <section className={styles.split}>
        <div className={styles.card}>
          <header className={styles.cardHead}>
            <span className={styles.cardTitle}>Distribuzione spesa</span>
            <span className={styles.cardMeta}>top 5 reparti</span>
          </header>
          <DepartmentBar data={topDepartments} />
        </div>
        <div className={styles.card}>
          <header className={styles.cardHead}>
            <span className={styles.cardTitle}>Stato budget</span>
            <span className={styles.cardMeta}>
              {overview.missingRatesCount} avvisi
            </span>
          </header>
          <ul className={styles.alerts}>
            {overview.missingRatesCount > 0 && (
              <li className={styles.alert} data-tone="warn">
                <div className={styles.alertTag}>Rate mancanti</div>
                <div>
                  <strong>
                    {overview.missingRatesCount} attori senza day-rate
                  </strong>{" "}
                  — imposta le tariffe per evitare stima a zero.
                </div>
              </li>
            )}
            {overview.categories
              .filter((c) => c.status === "missing")
              .map((c) => (
                <li key={c.id} className={styles.alert} data-tone="info">
                  <div className={styles.alertTag}>{c.label}</div>
                  <div>
                    <strong>Senza tariffa</strong> — categoria presente nel
                    breakdown ma non ancora stimata.
                  </div>
                </li>
              ))}
            {overview.missingRatesCount === 0 &&
              overview.categories.every((c) => c.status !== "missing") && (
                <li className={styles.alert} data-tone="ok">
                  <div className={styles.alertTag}>Pronto</div>
                  <div>
                    <strong>Tutte le categorie sono coperte</strong> — il
                    budget è pronto per il lock.
                  </div>
                </li>
              )}
          </ul>
        </div>
      </section>

      <section className={styles.catsSection}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Reparti</h2>
          <span className={styles.sectionMeta}>
            {overview.categories.length} categorie · clicca per dettaglio
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
              aria-label={`Apri dettaglio ${c.label}`}
            >
              <div className={styles.catTop}>
                <span className={styles.catName}>{c.label}</span>
                <span className={styles.catShare}>
                  {c.percent.toFixed(0)}%
                </span>
              </div>
              <div className={styles.catAmount}>
                {c.total > 0 ? eurCompact(c.total) : "—"}
              </div>
              <Sparkline
                values={c.sparkline}
                colorVar={c.colorVar}
                ariaLabel={`Andamento ${c.label}`}
              />
              <div className={styles.catFoot}>
                <span>
                  {c.resourceCount} {c.id === "cast" || c.id === "crew" ? "ruoli" : "voci"}
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
