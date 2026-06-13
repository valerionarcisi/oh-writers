import { DOCUMENT_LABELS } from "~/features/documents";
import type { DocumentType } from "@oh-writers/domain";
import { toPlainText } from "@oh-writers/utils";
import { useTranslation } from "~/features/i18n";
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
  const { t } = useTranslation();
  const cleanContent = toPlainText(document.content);
  const hasContent = cleanContent.length > 0;
  const preview = cleanContent.slice(0, 80);

  return (
    <div
      className={styles.card}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className={styles.header}>
        <span className={styles.type}>{labelFor(document.type)}</span>
        {hasContent ? (
          <span
            className={styles.completedDot}
            aria-label={t("projects.documentCard.completed")}
          />
        ) : (
          <span
            className={styles.emptyDot}
            aria-label={t("projects.documentCard.empty")}
          />
        )}
      </div>
      {hasContent ? (
        <p className={styles.preview}>
          {preview}
          {cleanContent.length > 80 ? "…" : ""}
        </p>
      ) : (
        <p className={styles.empty}>{t("projects.documentCard.notStarted")}</p>
      )}
    </div>
  );
}
