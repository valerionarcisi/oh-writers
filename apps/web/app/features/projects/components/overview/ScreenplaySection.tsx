import { useNavigate } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import type { ScreenplaySummary } from "../../server/project-overview.server";
import styles from "./ScreenplaySection.module.css";

interface ScreenplaySectionProps {
  readonly projectId: string;
  readonly screenplay: ScreenplaySummary | null;
}

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day} · ${time}`;
};

export function ScreenplaySection({
  projectId,
  screenplay,
}: ScreenplaySectionProps) {
  const navigate = useNavigate();

  const open = () =>
    void navigate({
      to: "/projects/$id/screenplay",
      params: { id: projectId },
    });

  return (
    <section
      className={styles.section}
      aria-labelledby="overview-screenplay-h"
    >
      <div className={styles.head}>
        <h2 id="overview-screenplay-h" className={styles.title}>
          Sceneggiatura
        </h2>
        <span className={styles.meta}>
          {screenplay ? "Versione attuale" : "Non ancora avviata"}
        </span>
      </div>
      <div className={styles.card}>
        {screenplay ? (
          <>
            <div className={styles.metaCol}>
              <div className={styles.titleRow}>
                <h3 className={styles.cardTitle}>{screenplay.title}</h3>
                {screenplay.draftLabel && (
                  <span className={styles.badge}>{screenplay.draftLabel}</span>
                )}
              </div>
              <div className={styles.stats}>
                <span>
                  <span className={styles.num}>{screenplay.pageCount}</span>{" "}
                  pagine
                </span>
                <span>
                  <span className={styles.num}>{screenplay.sceneCount}</span>{" "}
                  scene
                </span>
                <span>
                  <span className={styles.num}>
                    {screenplay.characterCount}
                  </span>{" "}
                  personaggi
                </span>
              </div>
              <div className={styles.foot}>
                Aggiornata {formatTimestamp(screenplay.updatedAt)} · Salvataggio
                automatico attivo
              </div>
            </div>
            <Button variant="primary" size="md" onClick={open}>
              Apri editor →
            </Button>
          </>
        ) : (
          <>
            <div className={styles.metaCol}>
              <h3 className={styles.cardTitle}>Nessuna sceneggiatura</h3>
              <div className={styles.foot}>
                Apri l'editor per creare la prima bozza.
              </div>
            </div>
            <Button variant="primary" size="md" onClick={open}>
              Apri editor →
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
