import { Suspense, useState } from "react";
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
  /** When provided, suggestions with both `find` and `replace` show an
   *  'Applica' button that calls this. Returns true when the edit was
   *  applied (the suggestion is then removed from the list locally). */
  onApplyEdit?: (find: string, replace: string) => boolean;
}

export function ScreenplayCesarePanel(props: ScreenplayCesarePanelProps) {
  return (
    <aside className={styles.panel} aria-label="Note di Cesare">
      <header className={styles.header}>
        <span className={styles.label}>Cesare</span>
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
  onApplyEdit,
}: ScreenplayCesarePanelProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const hasContent = sceneTotal > 0;
  const polishQ = useQuery(polishQueryOptions(screenplayId, { hasContent }));
  const staleQ = useQuery(staleScenesOptions(versionId ?? ""));
  const allSuggestions = polishQ.data?.suggestions ?? [];
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [notFoundIds, setNotFoundIds] = useState<Set<string>>(new Set());
  const suggestions = allSuggestions.filter((s) => !appliedIds.has(s.id));
  const staleScenes = staleQ.data ?? [];

  const handleApply = (id: string, find: string, replace: string) => {
    if (!onApplyEdit) return;
    const ok = onApplyEdit(find, replace);
    if (ok) {
      setAppliedIds((prev) => new Set(prev).add(id));
      setNotFoundIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setFlash("Modifica applicata · Cmd+Z per annullare");
      window.setTimeout(() => setFlash(null), 2400);
    } else {
      setNotFoundIds((prev) => new Set(prev).add(id));
    }
  };

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
      {/* SCENA + PAGINA entrambi rimossi: la posizione cursore è ambient noise.
       * Lo stato attivo lo mostra direttamente il cursore nell'editor. */}
      <section className={styles.notes}>
        <div className={styles.notesHeadRow}>
          <p className={styles.notesHead}>
            {!hasContent ? (
              "Scrivi almeno una scena per iniziare."
            ) : polishQ.isFetching ? (
              <span className={styles.loadingInline}>
                <span className={styles.spinner} aria-hidden="true" />
                Cesare sta leggendo…
              </span>
            ) : suggestions.length > 0 ? (
              `${suggestions.length} rifiniture proposte`
            ) : (
              "Nessuna rifinitura — buon ritmo."
            )}
          </p>
          <button
            type="button"
            className={styles.refresh}
            onClick={handleRefresh}
            disabled={polishQ.isFetching || !hasContent}
            aria-label="Rilegge la sceneggiatura"
            title="Rilegge la sceneggiatura"
          >
            ↻
          </button>
        </div>

        {flash && <p className={styles.flash}>{flash}</p>}

        {suggestions.length > 0 && (
          <ul className={styles.suggestionList}>
            {suggestions.map((s) => {
              const canApply =
                onApplyEdit !== undefined &&
                typeof s.find === "string" &&
                s.find.length > 0 &&
                typeof s.replace === "string" &&
                s.replace.length > 0;
              return (
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
                    <p className={styles.suggestionMessage}>
                      {s.message}
                      {notFoundIds.has(s.id) && (
                        <span
                          className={styles.notFoundTag}
                          title="Testo non trovato nella sceneggiatura"
                          aria-label="Testo non trovato nella sceneggiatura"
                        >
                          ! testo non trovato
                        </span>
                      )}
                    </p>
                    {canApply && (
                      <div className={styles.editPreview}>
                        <span className={styles.editFind}>{s.find}</span>
                        <span className={styles.editArrow} aria-hidden="true">
                          →
                        </span>
                        <span className={styles.editReplace}>{s.replace}</span>
                      </div>
                    )}
                    {canApply && (
                      <button
                        type="button"
                        className={styles.applyBtn}
                        onClick={() =>
                          handleApply(s.id, s.find as string, s.replace as string)
                        }
                        data-testid={`cesare-apply-${s.id}`}
                      >
                        Applica
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
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
