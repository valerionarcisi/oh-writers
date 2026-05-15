import type { KpiSummary } from "../../server/project-overview.server";
import styles from "./ProjectKpiStrip.module.css";

interface ProjectKpiStripProps {
  readonly kpi: KpiSummary;
}

interface KpiCell {
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
  const cells: KpiCell[] = [
    { label: "Pagine", value: String(kpi.pageCount) },
    { label: "Scene", value: String(kpi.sceneCount) },
    { label: "Personaggi", value: String(kpi.characterCount) },
    { label: "Location", value: String(kpi.locationCount) },
    {
      label: "Durata",
      value: String(kpi.estimatedMinutes),
      unit: "min",
    },
    {
      label: "Inattività",
      value: String(kpi.idleDays),
      unit: kpi.idleDays === 1 ? "giorno" : "giorni",
    },
  ];

  return (
    <section
      className={styles.kpis}
      aria-label="Statistiche progetto"
      data-testid="overview-kpi-strip"
    >
      {cells.map((c) => (
        <div key={c.label} className={styles.kpi}>
          <div className={styles.label}>{c.label}</div>
          <div className={styles.value}>
            {c.value}
            {c.unit && <span className={styles.unit}>{c.unit}</span>}
          </div>
        </div>
      ))}
      <div className={styles.kpiWide}>
        <div className={styles.label}>Ultima modifica</div>
        <div className={styles.valueSmall}>
          {formatLastEdited(kpi.lastEditedAt)}
        </div>
      </div>
    </section>
  );
}
