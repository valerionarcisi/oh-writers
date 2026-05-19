import { useState } from "react";
import { Button } from "@oh-writers/ui";
import type { DocumentVersion } from "@oh-writers/db/schema";
import type { DocumentType } from "@oh-writers/domain";
import {
  useDocumentDrafts,
  usePromoteDocumentDraft,
  useDiscardDocumentDraft,
} from "../hooks/useDocumentDrafts";
import { diffDocumentLines, type DocumentDiffLine } from "../lib/diff-document";
import styles from "./DraftBanner.module.css";

interface DraftBannerProps {
  readonly documentId: string;
  readonly projectId: string;
  readonly docType: DocumentType;
  readonly currentContent: string;
  readonly canEdit: boolean;
}

/**
 * Sticky banner shown above the document editor when Cesare has proposed one
 * or more drafts (rows in document_versions with isDraft=true). The user can
 * compare each draft against the current content, promote it (becomes the new
 * active version), or discard it.
 */
export function DraftBanner({
  documentId,
  projectId,
  docType,
  currentContent,
  canEdit,
}: DraftBannerProps) {
  const draftsQuery = useDocumentDrafts(documentId);
  const promote = usePromoteDocumentDraft(documentId, projectId, docType);
  const discard = useDiscardDocumentDraft(documentId, projectId, docType);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!draftsQuery.data || !draftsQuery.data.isOk) return null;
  const drafts = draftsQuery.data.value;
  if (drafts.length === 0) return null;

  return (
    <section
      className={styles.banner}
      role="region"
      aria-label="Bozze di Cesare"
      data-testid="document-draft-banner"
    >
      <header className={styles.header}>
        <span className={styles.title}>
          ✦ Cesare ha pronto{" "}
          {drafts.length === 1 ? "un draft" : `${drafts.length} draft`}
        </span>
        <span className={styles.hint}>
          Confronta, promuovi a versione attiva o scarta.
        </span>
      </header>
      <ul className={styles.list}>
        {drafts.map((d) => {
          const isExpanded = expandedId === d.id;
          return (
            <li key={d.id} className={styles.item} data-draft-id={d.id}>
              <div className={styles.row}>
                <span className={styles.label}>
                  {d.label ?? `Bozza #${d.number}`}
                </span>
                <div className={styles.actions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setExpandedId(isExpanded ? null : d.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`draft-diff-${d.id}`}
                    data-testid={`draft-compare-${d.id}`}
                  >
                    {isExpanded ? "Nascondi confronto" : "Confronta"}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!canEdit || promote.isPending}
                    onPress={() => promote.mutate(d.id)}
                    data-testid={`draft-promote-${d.id}`}
                  >
                    Promuovi a attiva
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!canEdit || discard.isPending}
                    onPress={() => discard.mutate(d.id)}
                    data-testid={`draft-discard-${d.id}`}
                  >
                    Scarta
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <DraftDiff
                  id={`draft-diff-${d.id}`}
                  currentContent={currentContent}
                  draft={d}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface DraftDiffProps {
  readonly id: string;
  readonly currentContent: string;
  readonly draft: DocumentVersion;
}

function DraftDiff({ id, currentContent, draft }: DraftDiffProps) {
  // Outline docs are JSON-encoded; render the raw JSON next to a stringified
  // current outline. Pretty-printing keeps the diff readable.
  const left = prettify(currentContent);
  const right = prettify(draft.content);
  const lines = diffDocumentLines(left, right);
  return (
    <div id={id} className={styles.diff} data-testid="draft-diff">
      <pre className={styles.diffSide} aria-label="Versione corrente">
        {lines.map((line, i) => (
          <DiffLineRow key={`l-${i}`} line={line} side="left" />
        ))}
      </pre>
      <pre className={styles.diffSide} aria-label="Bozza di Cesare">
        {lines.map((line, i) => (
          <DiffLineRow key={`r-${i}`} line={line} side="right" />
        ))}
      </pre>
    </div>
  );
}

function DiffLineRow({
  line,
  side,
}: {
  line: DocumentDiffLine;
  side: "left" | "right";
}) {
  if (line.type === "equal") {
    return (
      <span className={styles.lineEqual}>
        {line.text || " "}
        {"\n"}
      </span>
    );
  }
  if (line.type === "delete") {
    if (side === "left") {
      return (
        <span className={styles.lineDelete}>
          − {line.text || " "}
          {"\n"}
        </span>
      );
    }
    return <span className={styles.linePlaceholder}>{" \n"}</span>;
  }
  // insert
  if (side === "right") {
    return (
      <span className={styles.lineInsert}>
        + {line.text || " "}
        {"\n"}
      </span>
    );
  }
  return <span className={styles.linePlaceholder}>{" \n"}</span>;
}

const prettify = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return raw;
    }
  }
  return raw;
};
