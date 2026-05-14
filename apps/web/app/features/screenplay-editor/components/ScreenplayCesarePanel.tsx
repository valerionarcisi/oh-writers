import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";
import {
  projectBreakdownOptions,
  staleScenesOptions,
} from "~/features/breakdown";
import styles from "./ScreenplayCesarePanel.module.css";

interface ScreenplayCesarePanelProps {
  projectId: string;
  versionId: string | null;
  /** Live scene/page metrics — pure read, no mock. */
  pageCurrent: number;
  pageTotal: number;
  sceneCurrent: number | null;
  sceneTotal: number;
}

export function ScreenplayCesarePanel(props: ScreenplayCesarePanelProps) {
  return (
    <aside className={styles.panel} aria-label="Note di Cesare">
      <header className={styles.header}>
        <span className={styles.label}>Cesare · live</span>
      </header>
      <Suspense fallback={<p className={styles.loading}>Caricamento…</p>}>
        <PanelBody {...props} />
      </Suspense>
    </aside>
  );
}

function PanelBody({
  projectId,
  versionId,
  pageCurrent,
  pageTotal,
  sceneCurrent,
  sceneTotal,
}: ScreenplayCesarePanelProps) {
  const navigate = useNavigate();
  const rowsQ = useQuery(projectBreakdownOptions(projectId, versionId ?? ""));
  const staleQ = useQuery(staleScenesOptions(versionId ?? ""));
  const rows = rowsQ.data ?? [];
  const staleScenes = staleQ.data ?? [];

  // Real, aggregated metrics from breakdown — no mock strings.
  const pendingRows = rows.filter((r) => r.hasPending);
  const pendingCount = pendingRows.length;
  const totalElements = rows.length;

  // Top categories by number of pending elements, max 4 shown.
  const byCategory = new Map<BreakdownCategory, number>();
  for (const row of pendingRows) {
    const cat = row.element.category;
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }
  const topCategories = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const handleOpenBreakdown = () => {
    void navigate({
      to: "/projects/$id/breakdown",
      params: { id: projectId },
    });
  };

  return (
    <div className={styles.body}>
      <section className={styles.metrics}>
        <Metric label="Pagina" value={`${pageCurrent}/${pageTotal}`} />
        <Metric
          label="Scena"
          value={sceneCurrent != null ? `${sceneCurrent}/${sceneTotal}` : "—"}
        />
        <Metric label="Elementi" value={String(totalElements)} />
      </section>

      <section className={styles.notes}>
        <p className={styles.notesHead}>
          {pendingCount > 0
            ? `${pendingCount} suggerimenti aperti`
            : "Nessun suggerimento aperto"}
        </p>
        {topCategories.length > 0 && (
          <ul className={styles.catList}>
            {topCategories.map(([cat, n]) => {
              const meta = CATEGORY_META[cat];
              const colorVar = `var(${meta.colorToken.replace(
                "--cat-",
                "--ds-cat-",
              )})`;
              return (
                <li key={cat} className={styles.catRow}>
                  <span
                    className={styles.catDot}
                    style={{ background: colorVar }}
                    aria-hidden="true"
                  />
                  <span className={styles.catLabel}>{meta.labelIt}</span>
                  <span className={styles.catCount} data-num>
                    {n}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {staleScenes.length > 0 && (
          <p className={styles.stale}>
            {staleScenes.length}{" "}
            {staleScenes.length === 1 ? "scena obsoleta" : "scene obsolete"} —
            il breakdown è da rispogliare
          </p>
        )}
      </section>

      <button
        type="button"
        className={styles.openBreakdown}
        onClick={handleOpenBreakdown}
        data-testid="screenplay-cesare-open-breakdown"
      >
        Apri Breakdown →
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue} data-num>
        {value}
      </span>
    </div>
  );
}
