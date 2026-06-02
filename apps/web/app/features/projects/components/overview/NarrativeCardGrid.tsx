import { Link } from "@tanstack/react-router";
import type { DocumentSummary } from "../../server/project-overview.server";
import {
  DocumentTypes,
  documentTypeLabel,
  type DocumentType,
  type TranslationKey,
} from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./NarrativeCardGrid.module.css";

type Translate = (key: TranslationKey) => string;

interface NarrativeCardGridProps {
  readonly projectId: string;
  readonly documents: DocumentSummary[];
}

const DOC_ROUTE: Record<
  Exclude<DocumentType, "logline">,
  | "/projects/$id/soggetto"
  | "/projects/$id/synopsis"
  | "/projects/$id/outline"
  | "/projects/$id/treatment"
> = {
  soggetto: "/projects/$id/soggetto",
  synopsis: "/projects/$id/synopsis",
  outline: "/projects/$id/outline",
  treatment: "/projects/$id/treatment",
};

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));

const formatWords = (n: number, t: Translate): string =>
  n === 1
    ? t("projects.narrative.oneWord")
    : `${n.toLocaleString("it-IT")} ${t("projects.narrative.words")}`;

export function NarrativeCardGrid({
  projectId,
  documents,
}: NarrativeCardGridProps) {
  const { t, locale } = useTranslation();
  const orderedTypes: DocumentType[] = [
    DocumentTypes.SOGGETTO,
    DocumentTypes.SYNOPSIS,
    DocumentTypes.OUTLINE,
    DocumentTypes.TREATMENT,
  ];
  const visible = orderedTypes
    .map((type) => documents.find((d) => d.type === type))
    .filter((d): d is DocumentSummary => !!d);

  const completed = visible.filter((d) => d.hasContent).length;

  return (
    <section className={styles.section} aria-labelledby="overview-narrative-h">
      <div className={styles.head}>
        <h2 id="overview-narrative-h" className={styles.title}>
          {t("projects.narrative.heading")}
        </h2>
        <span className={styles.meta}>
          {completed} / {visible.length} {t("projects.narrative.documents")}
        </span>
      </div>
      <div className={styles.grid}>
        {visible.map((doc) => (
          <Link
            key={doc.id}
            to={DOC_ROUTE[doc.type as Exclude<DocumentType, "logline">]}
            params={{ id: projectId }}
            className={styles.card}
          >
            <div className={styles.cardHead}>
              <span className={styles.eyebrow}>
                {documentTypeLabel(doc.type, locale)}
              </span>
              <span
                className={`${styles.status} ${
                  doc.hasContent ? styles.statusDone : styles.statusDraft
                }`}
              >
                {doc.hasContent
                  ? t("projects.narrative.complete")
                  : t("projects.narrative.toStart")}
              </span>
            </div>
            <h3 className={styles.cardTitle}>
              {documentTypeLabel(doc.type, locale)}
            </h3>
            <p className={styles.preview}>
              {doc.preview || t("projects.narrative.emptyPreview")}
            </p>
            <div className={styles.foot}>
              {formatWords(doc.wordCount, t)} · {formatDate(doc.updatedAt)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
