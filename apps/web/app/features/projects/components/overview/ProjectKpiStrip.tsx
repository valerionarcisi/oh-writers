import type { KpiSummary } from "../../server/project-overview.server";
import { useTranslation } from "~/features/i18n";
import styles from "./ProjectKpiStrip.module.css";

interface ProjectKpiStripProps {
  readonly kpi: KpiSummary;
}

interface KpiCell {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

const formatLastEdited = (iso: string): string => {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day} · ${time}`;
};

export function ProjectKpiStrip({ kpi }: ProjectKpiStripProps) {
  const { t } = useTranslation();
  const cells: KpiCell[] = [
    { key: "pages", label: t("projects.kpi.pages"), value: String(kpi.pageCount) },
    { key: "scenes", label: t("projects.kpi.scenes"), value: String(kpi.sceneCount) },
    {
      key: "characters",
      label: t("projects.kpi.characters"),
      value: String(kpi.characterCount),
    },
    {
      key: "locations",
      label: t("projects.kpi.locations"),
      value: String(kpi.locationCount),
    },
    {
      key: "runtime",
      label: t("projects.kpi.runtime"),
      value: String(kpi.estimatedMinutes),
      unit: t("projects.kpi.runtimeUnit"),
    },
    {
      key: "idle",
      label: t("projects.kpi.idle"),
      value: String(kpi.idleDays),
      unit: kpi.idleDays === 1 ? t("projects.kpi.idleDay") : t("projects.kpi.idleDays"),
    },
  ];

  return (
    <section
      className={styles.kpis}
      aria-label={t("projects.kpi.label")}
      data-testid="overview-kpi-strip"
    >
      {cells.map((c) => (
        <div key={c.key} className={styles.kpi}>
          <div className={styles.label}>{c.label}</div>
          <div className={styles.value}>
            {c.value}
            {c.unit && <span className={styles.unit}>{c.unit}</span>}
          </div>
        </div>
      ))}
      <div className={styles.kpiWide}>
        <div className={styles.label}>{t("projects.kpi.lastEdit")}</div>
        <div className={styles.valueSmall}>
          {formatLastEdited(kpi.lastEditedAt)}
        </div>
      </div>
    </section>
  );
}
