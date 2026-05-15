import { useNavigate } from "@tanstack/react-router";
import type { DocumentSummary } from "../../server/project-overview.server";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import styles from "./NarrativeCardGrid.module.css";

interface NarrativeCardGridProps {
  readonly projectId: string;
  readonly documents: DocumentSummary[];
}

const TYPE_LABEL: Record<DocumentType, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
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
  const navigate = useNavigate();

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
          <button
            key={doc.id}
            type="button"
            className={styles.card}
            onClick={() =>
              void navigate({
                to: `/projects/${projectId}/${doc.type}` as never,
              })
            }
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
            <h3 className={styles.cardTitle}>{doc.title}</h3>
            <p className={styles.preview}>
              {doc.preview ||
                "Nessun contenuto. Apri per iniziare a scrivere."}
            </p>
            <div className={styles.foot}>
              {formatWords(doc.wordCount)} · {formatDate(doc.updatedAt)}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
