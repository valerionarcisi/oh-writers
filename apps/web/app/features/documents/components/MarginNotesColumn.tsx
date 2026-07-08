import { type FC, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@oh-writers/ui";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import {
  narrativePolishQueryOptions,
  type NarrativePolishSuggestion,
  type NarrativePolishSuggestionDoc,
} from "../server/narrative-polish.server";
import { useCesareOpen } from "~/features/app-shell";
import { useTranslation } from "~/features/i18n";
import {
  buildAdviceContentFingerprint,
  useDebouncedValue,
  EditorialAdviceStack,
  useEditorialAdviceMemory,
} from "~/features/predictions";
import styles from "./MarginNotesColumn.module.css";

/** Build the prompt that seeds a Cesare session from a margin suggestion. */
export function suggestionPrompt(memo: NarrativePolishSuggestion): string {
  return `${memo.title}: ${memo.body}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MarginNotesColumnProps {
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

function SkeletonNote() {
  return (
    <div className={styles.skeletonNote} aria-hidden="true">
      <span className={[styles.skeletonLine, styles.skeletonShort].join(" ")} />
      <span
        className={[styles.skeletonLine, styles.skeletonMedium].join(" ")}
      />
    </div>
  );
}

function LoadingState() {
  const { t } = useTranslation();
  return (
    <div
      className={styles.column}
      aria-busy="true"
      aria-label={t("documents.loading.notes")}
    >
      <SkeletonNote />
      <SkeletonNote />
      <SkeletonNote />
    </div>
  );
}

function EmptyContentState() {
  const { t } = useTranslation();
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>{t("documents.marginNotes.empty")}</p>
    </div>
  );
}

function ErrorState() {
  const { t } = useTranslation();
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>{t("documents.marginNotes.error")}</p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

/**
 * Margin notes column rendered to the right of the prose page on Soggetto /
 * Sinossi / Trattamento. Each suggestion from Cesare becomes a CollapsibleNote
 * with a leaf left-border and the group name as eyebrow.
 *
 * The first card opens by default so the user lands on actionable content
 * without an extra click. Subsequent cards stay collapsed and can be expanded
 * one at a time — same affordance as the mockup's `.note.open` behavior.
 * Expanding always works, Cesare open or not — the old "compact" CSS override
 * (hide the disclosed area while the drawer is open) made clicks appear dead.
 */
export const MarginNotesColumn: FC<MarginNotesColumnProps> = ({
  projectId,
  docType,
  content,
}) => {
  if (!isNarrativeDocType(docType)) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t } = useTranslation();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const openCesare = useCesareOpen();

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
    `${projectId}:${docType}:margin`,
    contentFingerprint,
  );

  const hasContent = content.length > 50;
  const isLoading = query.isFetching;
  const isError = query.isError || (query.data != null && !query.data.isOk);
  const isWaitingForDebounce = content !== debouncedContent;
  const statusLabel = isWaitingForDebounce
    ? t("documents.marginNotes.statusWaiting")
    : isLoading
      ? t("documents.marginNotes.statusReading")
      : suggestions.length > 0
        ? t("documents.marginNotes.statusActive").replace(
            "{count}",
            String(suggestions.length),
          )
        : t("documents.marginNotes.statusApproved");

  if (!hasContent) {
    return (
      <aside
        className={styles.column}
        aria-label={t("documents.marginNotes.ariaLabel")}
      >
        <EmptyContentState />
      </aside>
    );
  }

  if (isLoading && suggestions.length === 0) {
    return <LoadingState />;
  }

  if (isError) {
    return (
      <aside
        className={styles.column}
        aria-label={t("documents.marginNotes.ariaLabel")}
      >
        <ErrorState />
      </aside>
    );
  }

  return (
    <aside
      className={styles.column}
      aria-label={t("documents.marginNotes.ariaLabel")}
      data-testid="margin-notes-column"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.label}>{t("documents.marginNotes.header")}</p>
          <p className={styles.status}>{statusLabel}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => void query.refetch()}
          disabled={!hasContent || query.isFetching}
        >
          {t("documents.marginNotes.reread")}
        </Button>
      </header>
      <EditorialAdviceStack
        advice={suggestions}
        rememberedStatuses={statuses}
        fallbackArea={docType === DocumentTypes.SOGGETTO ? "subject" : docType}
        onExplore={(memo) => openCesare({ prompt: suggestionPrompt(memo) })}
        onMarkAuthorialChoice={(memo) =>
          setAdviceStatus(memo, "authorial_choice")
        }
        onIgnore={(memo) => setAdviceStatus(memo, "ignored")}
        onResolve={(memo) => setAdviceStatus(memo, "resolved")}
        onApprove={(memo) => setAdviceStatus(memo, "approved")}
      />
    </aside>
  );
};
