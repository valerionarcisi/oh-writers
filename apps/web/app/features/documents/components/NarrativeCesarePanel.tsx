import { type FC, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import {
  narrativePolishQueryOptions,
  type NarrativePolishSuggestion,
  type NarrativePolishSuggestionDoc,
} from "../server/narrative-polish.server";
import styles from "./NarrativeCesarePanel.module.css";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NarrativeCesarePanelProps {
  readonly projectId: string;
  readonly docType: DocumentType;
  /** Current document content — suggestions are keyed on the first 200 chars. */
  readonly content: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isNarrativeDocType = (type: DocumentType): type is NarrativePolishSuggestionDoc =>
  type === DocumentTypes.SOGGETTO ||
  type === DocumentTypes.SYNOPSIS ||
  type === DocumentTypes.OUTLINE ||
  type === DocumentTypes.TREATMENT;

const groupByGroup = (
  memos: readonly NarrativePolishSuggestion[],
): ReadonlyArray<{ group: string; items: readonly NarrativePolishSuggestion[] }> => {
  const order: string[] = [];
  const buckets = new Map<string, NarrativePolishSuggestion[]>();
  for (const memo of memos) {
    const bucket = buckets.get(memo.group);
    if (bucket) {
      bucket.push(memo);
    } else {
      buckets.set(memo.group, [memo]);
      order.push(memo.group);
    }
  }
  return order.map((group) => ({ group, items: buckets.get(group) ?? [] }));
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function SkeletonMemo() {
  return (
    <li className={styles.item} aria-hidden="true">
      <p className={[styles.itemCat, styles.skeletonLine, styles.skeletonShort].join(" ")} />
      <p className={[styles.itemText, styles.skeletonLine, styles.skeletonLong].join(" ")} />
      <p className={[styles.itemText, styles.skeletonLine, styles.skeletonMedium].join(" ")} />
    </li>
  );
}

function LoadingSkeleton() {
  return (
    <div className={styles.body} aria-busy="true" aria-label="Caricamento suggerimenti">
      <section className={styles.group}>
        <p className={[styles.groupLabel, styles.skeletonLine, styles.skeletonShort].join(" ")} aria-hidden="true" />
        <ul className={styles.list}>
          <SkeletonMemo />
          <SkeletonMemo />
        </ul>
      </section>
      <section className={styles.group}>
        <p className={[styles.groupLabel, styles.skeletonLine, styles.skeletonShort].join(" ")} aria-hidden="true" />
        <ul className={styles.list}>
          <SkeletonMemo />
        </ul>
      </section>
    </div>
  );
}

function EmptyContentState() {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>Inizia a scrivere per ricevere suggerimenti da Cesare.</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>Impossibile caricare i suggerimenti. Riprova più tardi.</p>
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
  const query = useQuery(narrativePolishQueryOptions(projectId, docType, content));

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const suggestions = useMemo<readonly NarrativePolishSuggestion[]>(() => {
    if (!query.data || !query.data.isOk) return [];
    return query.data.value;
  }, [query.data]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const grouped = useMemo(() => groupByGroup(suggestions), [suggestions]);

  const hasContent = content.length > 50;
  const isLoading = query.isFetching;
  const isError = query.isError || (query.data != null && !query.data.isOk);

  const statusLabel = isLoading
    ? "Analisi…"
    : isError
      ? "Errore"
      : suggestions.length > 0
        ? `${suggestions.length} note`
        : hasContent
          ? "Nessuna nota"
          : "–";

  const lastUpdated = query.dataUpdatedAt > 0
    ? new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(query.dataUpdatedAt),
      )
    : null;

  return (
    <aside className={styles.panel} aria-label="Note di Cesare">
      <header className={styles.header}>
        <span className={styles.label}>Cesare</span>
        <span className={styles.status}>{statusLabel}</span>
      </header>

      {!hasContent ? (
        <EmptyContentState />
      ) : isLoading && suggestions.length === 0 ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState />
      ) : (
        <div className={styles.body}>
          {grouped.map(({ group, items }) => (
            <section key={group} className={styles.group}>
              <p className={styles.groupLabel}>{group}</p>
              <ul className={styles.list}>
                {items.map((memo) => (
                  <li key={memo.id} className={styles.item}>
                    <p className={styles.itemCat}>{memo.category}</p>
                    <p className={styles.itemText}>{memo.message}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className={styles.footer}>
        <span>Analisi AI</span>
        <span>{lastUpdated ?? "–"}</span>
      </footer>
    </aside>
  );
};
