import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import {
  scenePolishQueryOptions,
  type PolishSuggestion,
} from "../server/screenplay-polish.server";
import { staleScenesOptions } from "~/features/breakdown";
import { useTranslation } from "~/features/i18n";
import {
  EDITORIAL_ADVICE_REFRESH_DEBOUNCE_MS,
  EditorialAdviceStack,
  useDebouncedValue,
  useEditorialAdviceMemory,
} from "~/features/predictions";
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
  const { t } = useTranslation();
  return (
    <aside
      className={styles.panel}
      aria-label={t("screenplay.cesare.notesAria")}
    >
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

function PanelBody({
  projectId,
  screenplayId,
  versionId,
  pageCurrent,
  pageTotal,
  sceneCurrent,
  sceneTotal,
}: ScreenplayCesarePanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasContent = sceneTotal > 0;

  const debouncedScene = useDebouncedValue(
    sceneCurrent,
    EDITORIAL_ADVICE_REFRESH_DEBOUNCE_MS,
  );

  const polishQ = useQuery(
    scenePolishQueryOptions(screenplayId, debouncedScene, { hasContent }),
  );
  const staleQ = useQuery(staleScenesOptions(versionId ?? ""));
  const suggestions = polishQ.data?.suggestions ?? [];
  const { statuses, setAdviceStatus } = useEditorialAdviceMemory(
    projectId,
    "screenplay",
    polishQ.data?.sceneId ?? undefined,
  );
  const staleScenes = staleQ.data ?? [];

  const handleOpenBreakdown = () => {
    void navigate({
      to: "/projects/$id/breakdown",
      params: { id: projectId },
    });
  };

  const sceneLabel =
    debouncedScene !== null
      ? `${t("screenplay.cesare.scenePrefix")}${debouncedScene}`
      : null;
  const isWaitingForDebounce = sceneCurrent !== debouncedScene;
  const isLoading = hasContent && (isWaitingForDebounce || polishQ.isFetching);
  const hadPreviousSuggestions = suggestions.length > 0;

  return (
    <div className={styles.body}>
      <section className={styles.notes}>
        <div className={styles.notesHeadRow}>
          <p className={styles.notesHead}>
            {!hasContent
              ? t("screenplay.cesare.writeOneScene")
              : isLoading
                ? `${sceneLabel ? `${sceneLabel} · ` : ""}${t("screenplay.cesare.cesareReading")}`
                : suggestions.length > 0
                  ? `${sceneLabel ? `${sceneLabel} · ` : ""}${suggestions.length}${t("screenplay.cesare.refinementsSuffix")}`
                  : `${sceneLabel ? `${sceneLabel} · ` : ""}${t("screenplay.cesare.noRefinements")}`}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => void polishQ.refetch()}
            disabled={polishQ.isFetching || !hasContent}
            aria-label={t("screenplay.cesare.rereadAria")}
          >
            {t("screenplay.cesare.reread")}
          </Button>
        </div>

        {isLoading && !hadPreviousSuggestions && (
          <ul
            className={styles.suggestionList}
            aria-busy="true"
            aria-live="polite"
          >
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

        {suggestions.length > 0 && (
          <EditorialAdviceStack
            advice={suggestions}
            rememberedStatuses={statuses}
            fallbackArea="screenplay"
            scenePrefix={t("screenplay.cesare.scenePrefix")}
            onMarkAuthorialChoice={(advice) =>
              setAdviceStatus(advice, "authorial_choice")
            }
            onIgnore={(advice) => setAdviceStatus(advice, "ignored")}
            onResolve={(advice) => setAdviceStatus(advice, "resolved")}
            onApprove={(advice) => setAdviceStatus(advice, "approved")}
          />
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
