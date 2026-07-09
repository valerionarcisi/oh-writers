import { type FC, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@oh-writers/ui";
import {
  DocumentTypes,
  formatTime,
  type DocumentType,
} from "@oh-writers/domain";
import {
  narrativePolishQueryOptions,
  type NarrativePolishSuggestion,
  type NarrativePolishSuggestionDoc,
} from "../server/narrative-polish.server";
import { useTranslation } from "~/features/i18n";
import {
  buildAdviceContentFingerprint,
  useDebouncedValue,
  EditorialAdviceStack,
  useEditorialAdviceMemory,
} from "~/features/predictions";
import styles from "./NarrativeCesarePanel.module.css";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NarrativeCesarePanelProps {
  readonly projectId: string;
  readonly docType: DocumentType;
  /** Current document content. */
  readonly content: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isNarrativeDocType = (
  type: DocumentType,
): type is NarrativePolishSuggestionDoc =>
  type === DocumentTypes.SOGGETTO ||
  type === DocumentTypes.SYNOPSIS ||
  type === DocumentTypes.OUTLINE ||
  type === DocumentTypes.TREATMENT;

// ─── Sub-components ────────────────────────────────────────────────────────────

function SkeletonMemo() {
  return (
    <li className={styles.item} aria-hidden="true">
      <p
        className={[
          styles.itemCat,
          styles.skeletonLine,
          styles.skeletonShort,
        ].join(" ")}
      />
      <p
        className={[
          styles.itemText,
          styles.skeletonLine,
          styles.skeletonLong,
        ].join(" ")}
      />
      <p
        className={[
          styles.itemText,
          styles.skeletonLine,
          styles.skeletonMedium,
        ].join(" ")}
      />
    </li>
  );
}

function LoadingSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div className={styles.body} aria-busy="true" aria-label={loadingLabel}>
      <section className={styles.group}>
        <p
          className={[
            styles.groupLabel,
            styles.skeletonLine,
            styles.skeletonShort,
          ].join(" ")}
          aria-hidden="true"
        />
        <ul className={styles.list}>
          <SkeletonMemo />
          <SkeletonMemo />
        </ul>
      </section>
      <section className={styles.group}>
        <p
          className={[
            styles.groupLabel,
            styles.skeletonLine,
            styles.skeletonShort,
          ].join(" ")}
          aria-hidden="true"
        />
        <ul className={styles.list}>
          <SkeletonMemo />
        </ul>
      </section>
    </div>
  );
}

function EmptyContentState() {
  const { t } = useTranslation();
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>{t("documents.cesarePanel.empty")}</p>
    </div>
  );
}

function ErrorState() {
  const { t } = useTranslation();
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>{t("documents.cesarePanel.error")}</p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export const NarrativeCesarePanel: FC<NarrativeCesarePanelProps> = ({
  projectId,
  docType,
  content,
}) => {
  if (!isNarrativeDocType(docType)) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t, locale } = useTranslation();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const debouncedContent = useDebouncedValue(content);
  const contentFingerprint = buildAdviceContentFingerprint(debouncedContent);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const query = useQuery(
    narrativePolishQueryOptions(
      projectId,
      docType,
      debouncedContent,
      contentFingerprint,
    ),
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const suggestions = useMemo<readonly NarrativePolishSuggestion[]>(() => {
    if (!query.data || !query.data.isOk) return [];
    return query.data.value;
  }, [query.data]);
  const { statuses, setAdviceStatus } = useEditorialAdviceMemory(
    projectId,
    docType,
  );

  const hasContent = content.length > 50;
  const isLoading = query.isFetching;
  const isError = query.isError || (query.data != null && !query.data.isOk);
  const isWaitingForDebounce = content !== debouncedContent;

  const statusLabel = isWaitingForDebounce
    ? t("documents.cesarePanel.statusWaiting")
    : isLoading
      ? t("documents.cesarePanel.statusAnalyzing")
      : isError
        ? t("documents.cesarePanel.statusError")
        : suggestions.length > 0
          ? t("documents.cesarePanel.statusNotes").replace(
              "{count}",
              String(suggestions.length),
            )
          : hasContent
            ? t("documents.cesarePanel.statusApproved")
            : t("documents.cesarePanel.statusNone");

  const lastUpdated =
    query.dataUpdatedAt > 0
      ? formatTime(new Date(query.dataUpdatedAt), locale)
      : null;

  return (
    <aside
      className={styles.panel}
      aria-label={t("documents.cesarePanel.ariaLabel")}
    >
      <header className={styles.header}>
        <span className={styles.label}>Cesare</span>
        <span className={styles.status}>{statusLabel}</span>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => void query.refetch()}
          disabled={!hasContent || query.isFetching}
        >
          {t("documents.cesarePanel.reread")}
        </Button>
      </header>

      {!hasContent ? (
        <EmptyContentState />
      ) : isLoading && suggestions.length === 0 ? (
        <LoadingSkeleton loadingLabel={t("documents.loading.suggestions")} />
      ) : isError ? (
        <ErrorState />
      ) : (
        <div className={styles.body}>
          <EditorialAdviceStack
            advice={suggestions}
            rememberedStatuses={statuses}
            fallbackArea={
              docType === DocumentTypes.SOGGETTO ? "subject" : docType
            }
            onMarkAuthorialChoice={(memo) =>
              setAdviceStatus(memo, "authorial_choice")
            }
            onIgnore={(memo) => setAdviceStatus(memo, "ignored")}
            onResolve={(memo) => setAdviceStatus(memo, "resolved")}
            onApprove={(memo) => setAdviceStatus(memo, "approved")}
          />
        </div>
      )}

      <footer className={styles.footer}>
        <span>{t("documents.cesarePanel.footerAnalysis")}</span>
        <span>{lastUpdated ?? "–"}</span>
      </footer>
    </aside>
  );
};
