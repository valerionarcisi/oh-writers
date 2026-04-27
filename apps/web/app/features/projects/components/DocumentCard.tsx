import { DOCUMENT_LABELS } from "~/features/documents";
import type { DocumentType } from "@oh-writers/domain";
import styles from "./DocumentCard.module.css";

interface DocumentCardProps {
  document: {
    id: string;
    type: string;
    content: string;
  };
  onClick?: () => void;
}

const labelFor = (type: string): string =>
  DOCUMENT_LABELS[type as DocumentType] ?? type;

export function DocumentCard({ document, onClick }: DocumentCardProps) {
  const hasContent = document.content.length > 0;
  const preview = document.content.slice(0, 80);

  return (
    <div
      className={styles.card}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className={styles.header}>
        <span className={styles.type}>{labelFor(document.type)}</span>
        {hasContent ? (
          <span className={styles.completedDot} aria-label="Completed" />
        ) : (
          <span className={styles.emptyDot} aria-label="Empty" />
        )}
      </div>
      {hasContent ? (
        <p className={styles.preview}>
          {preview}
          {document.content.length > 80 ? "…" : ""}
        </p>
      ) : (
        <p className={styles.empty}>Not started</p>
      )}
    </div>
  );
}
