import { Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  polishQueryOptions,
  type PolishSuggestion,
} from "../server/screenplay-polish.server";
import { staleScenesOptions } from "~/features/breakdown";
import styles from "./ScreenplayCesarePanel.module.css";

interface ScreenplayCesarePanelProps {
  projectId: string;
  screenplayId: string;
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
        <span className={styles.label}>Cesare · polish</span>
      </header>
      <Suspense fallback={<p className={styles.loading}>Lettura in corso…</p>}>
        <PanelBody {...props} />
      </Suspense>
    </aside>
  );
}

const KIND_LABEL: Record<PolishSuggestion["kind"], string> = {
  dialogue: "Dialogo",
  action: "Azione",
  structure: "Struttura",
  pacing: "Pacing",
  style: "Stile",
  format: "Formato",
};

const KIND_COLOR: Record<PolishSuggestion["kind"], string> = {
  dialogue: "var(--ds-cat-cast, #6c4d8c)",
  action: "var(--ds-text-3, #8a8479)",
  structure: "var(--ds-cat-locations, #b07a3a)",
  pacing: "var(--ds-action, #b04a2a)",
  style: "var(--ds-cat-costumi, #c98a8a)",
  format: "var(--ds-cat-suono, #5a8a6a)",
};

function PanelBody({
  projectId,
  screenplayId,
  versionId,
  pageCurrent,
  pageTotal,
  sceneCurrent,
  sceneTotal,
}: ScreenplayCesarePanelProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const polishQ = useQuery(polishQueryOptions(screenplayId));
  const staleQ = useQuery(staleScenesOptions(versionId ?? ""));
  const suggestions = polishQ.data?.suggestions ?? [];
  const staleScenes = staleQ.data ?? [];

  const handleOpenBreakdown = () => {
    void navigate({
      to: "/projects/$id/breakdown",
      params: { id: projectId },
    });
  };

  const handleRefresh = () => {
    void qc.invalidateQueries({
      queryKey: ["screenplay-polish", screenplayId],
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
      </section>

      <section className={styles.notes}>
        <div className={styles.notesHeadRow}>
          <p className={styles.notesHead}>
            {polishQ.isFetching
              ? "Cesare sta leggendo…"
              : suggestions.length > 0
                ? `${suggestions.length} rifiniture proposte`
                : "Nessuna rifinitura — buon ritmo."}
          </p>
          <button
            type="button"
            className={styles.refresh}
            onClick={handleRefresh}
            disabled={polishQ.isFetching}
            aria-label="Rilegge la sceneggiatura"
            title="Rilegge la sceneggiatura"
          >
            ↻
          </button>
        </div>

        {suggestions.length > 0 && (
          <ul className={styles.suggestionList}>
            {suggestions.slice(0, 5).map((s) => (
              <li key={s.id} className={styles.suggestionRow}>
                <span
                  className={styles.kindDot}
                  style={{ background: KIND_COLOR[s.kind] }}
                  aria-hidden="true"
                />
                <div className={styles.suggestionBody}>
                  <p className={styles.suggestionMeta}>
                    <span
                      className={styles.kindTag}
                      style={{ color: KIND_COLOR[s.kind] }}
                    >
                      {KIND_LABEL[s.kind]}
                    </span>
                    <span className={styles.sceneTag} data-num>
                      Sc. {s.scene}
                    </span>
                  </p>
                  <p className={styles.suggestionMessage}>{s.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {staleScenes.length > 0 && (
          <p className={styles.stale}>
            {staleScenes.length}{" "}
            {staleScenes.length === 1 ? "scena obsoleta" : "scene obsolete"} —
            il breakdown è da rispogliare.
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
