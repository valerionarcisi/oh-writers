import { Link } from "@tanstack/react-router";
import type { DocumentSummary } from "../../server/project-overview.server";
import {
  DocumentTypes,
  DOCUMENT_TYPE_LABELS_IT,
  type DocumentType,
} from "@oh-writers/domain";
import styles from "./NarrativeCardGrid.module.css";

interface NarrativeCardGridProps {
  readonly projectId: string;
  readonly documents: DocumentSummary[];
}

const TYPE_LABEL = DOCUMENT_TYPE_LABELS_IT;

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

const formatWords = (n: number): string =>
  n === 1 ? "1 parola" : `${n.toLocaleString("it-IT")} parole`;

export function NarrativeCardGrid({
  projectId,
  documents,
}: NarrativeCardGridProps) {
  const orderedTypes: DocumentType[] = [
    DocumentTypes.SOGGETTO,
    DocumentTypes.SYNOPSIS,
    DocumentTypes.OUTLINE,
    DocumentTypes.TREATMENT,
  ];
  const visible = orderedTypes
    .map((t) => documents.find((d) => d.type === t))
    .filter((d): d is DocumentSummary => !!d);

  const completed = visible.filter((d) => d.hasContent).length;

  return (
    <section className={styles.section} aria-labelledby="overview-narrative-h">
      <div className={styles.head}>
        <h2 id="overview-narrative-h" className={styles.title}>
          Sviluppo narrativo
        </h2>
        <span className={styles.meta}>
          {completed} / {visible.length} documenti
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
              <span className={styles.eyebrow}>{TYPE_LABEL[doc.type]}</span>
              <span
                className={`${styles.status} ${
                  doc.hasContent ? styles.statusDone : styles.statusDraft
                }`}
              >
                {doc.hasContent ? "Completo" : "Da iniziare"}
              </span>
            </div>
            <h3 className={styles.cardTitle}>{TYPE_LABEL[doc.type]}</h3>
            <p className={styles.preview}>
              {doc.preview || "Nessun contenuto. Apri per iniziare a scrivere."}
            </p>
            <div className={styles.foot}>
              {formatWords(doc.wordCount)} · {formatDate(doc.updatedAt)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
