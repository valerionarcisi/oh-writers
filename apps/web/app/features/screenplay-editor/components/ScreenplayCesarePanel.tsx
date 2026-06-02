import { Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  scenePolishQueryOptions,
  type PolishSuggestion,
} from "../server/screenplay-polish.server";
import { staleScenesOptions } from "~/features/breakdown";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
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
  const { t } = useTranslation();
  return (
    <aside className={styles.panel} aria-label={t("screenplay.cesare.notesAria")}>
      <header className={styles.header}>
        <span className={styles.label}>Cesare</span>
      </header>
      <Suspense
        fallback={
          <p className={styles.loading}>{t("screenplay.cesare.reading")}</p>
        }
      >
        <PanelBody {...props} />
      </Suspense>
    </aside>
  );
}

const KIND_LABEL_KEY: Record<PolishSuggestion["kind"], TranslationKey> = {
  dialogue: "screenplay.cesare.kind.dialogue",
  action: "screenplay.cesare.kind.action",
  structure: "screenplay.cesare.kind.structure",
  pacing: "screenplay.cesare.kind.pacing",
  style: "screenplay.cesare.kind.style",
  format: "screenplay.cesare.kind.format",
};

const KIND_COLOR: Record<PolishSuggestion["kind"], string> = {
  dialogue: "var(--ds-cat-cast, #6c4d8c)",
  action: "var(--ds-text-3, #8a8479)",
  structure: "var(--ds-cat-locations, #b07a3a)",
  pacing: "var(--ds-action, #b04a2a)",
  style: "var(--ds-cat-costumi, #c98a8a)",
  format: "var(--ds-cat-suono, #5a8a6a)",
};

const SCENE_DEBOUNCE_MS = 1000;

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const hasContent = sceneTotal > 0;

  // Debounce scene changes — don't fire a new request on every scroll tick.
  // After 1s of stability, commit the scene number and let TanStack Query
  // handle cache: if this scene was already fetched, it returns immediately.
  const [debouncedScene, setDebouncedScene] = useState<number | null>(sceneCurrent);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedScene(sceneCurrent), SCENE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [sceneCurrent]);

  const polishQ = useQuery(
    scenePolishQueryOptions(screenplayId, debouncedScene, { hasContent }),
  );
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
      setFlash(t("screenplay.cesare.editApplied"));
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
      queryKey: ["screenplay-polish", screenplayId, debouncedScene],
    });
  };

  const sceneLabel =
    debouncedScene !== null
      ? `${t("screenplay.cesare.scenePrefix")}${debouncedScene}`
      : null;
  const isWaitingForDebounce = sceneCurrent !== debouncedScene;
  const isLoading =
    hasContent && (isWaitingForDebounce || polishQ.isFetching);
  const hadPreviousSuggestions = suggestions.length > 0;

  return (
    <div className={styles.body}>
      <section className={styles.notes}>
        <div className={styles.notesHeadRow}>
          <p className={styles.notesHead}>
            {!hasContent ? (
              t("screenplay.cesare.writeOneScene")
            ) : isLoading ? (
              `${sceneLabel ? `${sceneLabel} · ` : ""}${t("screenplay.cesare.cesareReading")}`
            ) : suggestions.length > 0 ? (
              `${sceneLabel ? `${sceneLabel} · ` : ""}${suggestions.length}${t("screenplay.cesare.refinementsSuffix")}`
            ) : (
              `${sceneLabel ? `${sceneLabel} · ` : ""}${t("screenplay.cesare.noRefinements")}`
            )}
          </p>
          <button
            type="button"
            className={styles.refresh}
            onClick={handleRefresh}
            disabled={polishQ.isFetching || !hasContent}
            aria-label={t("screenplay.cesare.rereadAria")}
            title={t("screenplay.cesare.rereadTitle")}
          >
            ↻
          </button>
        </div>

        {isLoading && !hadPreviousSuggestions && (
          <ul className={styles.suggestionList} aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <li key={i} className={styles.suggestionRow}>
                <span
                  className={`${styles.kindDot} ${styles.skeletonDot}`}
                  aria-hidden="true"
                />
                <div className={styles.suggestionBody}>
                  <p className={styles.suggestionMeta}>
                    <span
                      className={`${styles.skeletonLine} ${styles.skeletonShort}`}
                      aria-hidden="true"
                    />
                  </p>
                  <p className={styles.suggestionMessage}>
                    <span
                      className={`${styles.skeletonLine} ${styles.skeletonLong}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`${styles.skeletonLine} ${styles.skeletonMedium}`}
                      aria-hidden="true"
                    />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

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
                        {t(KIND_LABEL_KEY[s.kind])}
                      </span>
                      <span className={styles.sceneTag} data-num>
                        {t("screenplay.cesare.scenePrefix")}
                        {s.scene}
                      </span>
                    </p>
                    <p className={styles.suggestionMessage}>
                      {s.message}
                      {notFoundIds.has(s.id) && (
                        <span
                          className={styles.notFoundTag}
                          title={t("screenplay.cesare.textNotFoundTitle")}
                          aria-label={t("screenplay.cesare.textNotFoundTitle")}
                        >
                          {t("screenplay.cesare.textNotFoundTag")}
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
                        {t("screenplay.cesare.apply")}
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
            {staleScenes.length === 1
              ? t("screenplay.cesare.staleSingular")
              : t("screenplay.cesare.stalePlural")}
            {t("screenplay.cesare.staleSuffix")}
          </p>
        )}
      </section>

      <button
        type="button"
        className={styles.openBreakdown}
        onClick={handleOpenBreakdown}
        data-testid="screenplay-cesare-open-breakdown"
      >
        {t("screenplay.cesare.openBreakdown")}
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
