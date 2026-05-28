import { type FC, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import { CollapsibleNote } from "@oh-writers/ui";
import {
  narrativePolishQueryOptions,
  type NarrativePolishSuggestion,
  type NarrativePolishSuggestionDoc,
} from "../server/narrative-polish.server";
import styles from "./MarginNotesColumn.module.css";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MarginNotesColumnProps {
  readonly projectId: string;
  readonly docType: DocumentType;
  /** Current document content — suggestions are keyed on the first 200 chars. */
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
  return (
    <div
      className={styles.column}
      aria-busy="true"
      aria-label="Caricamento note"
    >
      <SkeletonNote />
      <SkeletonNote />
      <SkeletonNote />
    </div>
  );
}

function EmptyContentState() {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>
        Inizia a scrivere per ricevere note da Cesare.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>
        Impossibile caricare le note. Riprova più tardi.
      </p>
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
 *
 * When Cesare's floating sub-window is open (`body[data-cesare]` ≠ `closed`),
 * a parent CSS rule collapses every note back to one-line to free reading
 * space — the spec calls this the "compact" mode (see `MarginNotesColumn.module.css`).
 */
export const MarginNotesColumn: FC<MarginNotesColumnProps> = ({
  projectId,
  docType,
  content,
}) => {
  if (!isNarrativeDocType(docType)) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const query = useQuery(
    narrativePolishQueryOptions(projectId, docType, content),
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const suggestions = useMemo<readonly NarrativePolishSuggestion[]>(() => {
    if (!query.data || !query.data.isOk) return [];
    return query.data.value;
  }, [query.data]);

  const hasContent = content.length > 50;
  const isLoading = query.isFetching;
  const isError = query.isError || (query.data != null && !query.data.isOk);

  if (!hasContent) {
    return (
      <aside className={styles.column} aria-label="Note di Cesare">
        <EmptyContentState />
      </aside>
    );
  }

  if (isLoading && suggestions.length === 0) {
    return <LoadingState />;
  }

  if (isError) {
    return (
      <aside className={styles.column} aria-label="Note di Cesare">
        <ErrorState />
      </aside>
    );
  }

  if (suggestions.length === 0) {
    return (
      <aside className={styles.column} aria-label="Note di Cesare">
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Nessuna nota in questo momento.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={styles.column}
      aria-label="Note di Cesare"
      data-testid="margin-notes-column"
    >
      {suggestions.map((memo, idx) => (
        <CollapsibleNote
          key={memo.id}
          kind="cesare"
          eyebrow={`Cesare · ${memo.group}`}
          title={memo.category}
          body={memo.message}
          defaultOpen={idx === 0}
          testId={`margin-note-${memo.id}`}
        />
      ))}
    </aside>
  );
};
