import { useNavigate } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import type { ScreenplaySummary } from "../../server/project-overview.server";
import { useTranslation } from "~/features/i18n";
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
  const { t } = useTranslation();
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
          {t("nav.screenplay")}
        </h2>
        <span className={styles.meta}>
          {screenplay
            ? t("projects.screenplaySection.currentVersion")
            : t("projects.screenplaySection.notStarted")}
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
                  {t("projects.screenplaySection.pages")}
                </span>
                <span>
                  <span className={styles.num}>{screenplay.sceneCount}</span>{" "}
                  {t("projects.screenplaySection.scenes")}
                </span>
                <span>
                  <span className={styles.num}>
                    {screenplay.characterCount}
                  </span>{" "}
                  {t("projects.screenplaySection.characters")}
                </span>
              </div>
              <div className={styles.foot}>
                {t("projects.screenplaySection.updated")}{" "}
                {formatTimestamp(screenplay.updatedAt)} ·{" "}
                {t("projects.screenplaySection.autosave")}
              </div>
            </div>
            <Button variant="primary" size="md" onPress={open}>
              {t("projects.screenplaySection.openEditor")}
            </Button>
          </>
        ) : (
          <>
            <div className={styles.metaCol}>
              <h3 className={styles.cardTitle}>
                {t("projects.screenplaySection.noScreenplay")}
              </h3>
              <div className={styles.foot}>
                {t("projects.screenplaySection.createFirstDraft")}
              </div>
            </div>
            <Button variant="primary" size="md" onPress={open}>
              {t("projects.screenplaySection.openEditor")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
