import { Link } from "@tanstack/react-router";
import { Avatar } from "@oh-writers/ui";
import { TEAM_ROLE_LABELS_IT, type TranslationKey } from "@oh-writers/domain";
import type { DashboardProject } from "../../dashboard.schema";
import { ProjectCoverGradient } from "./ProjectCoverGradient";
import { useTranslation } from "~/features/i18n";
import styles from "./ProjectCardGrid.module.css";

interface Props {
  readonly project: DashboardProject;
}

const FORMAT_LABEL_KEYS: Record<string, TranslationKey> = {
  feature: "dashboard.card.formatFeature",
  short: "dashboard.card.formatShort",
  series_episode: "dashboard.card.formatSeriesEpisode",
  pilot: "dashboard.card.formatPilot",
};

const GENRE_LABEL_KEYS: Record<string, TranslationKey> = {
  drama: "dashboard.card.genreDrama",
  comedy: "dashboard.card.genreComedy",
  thriller: "dashboard.card.genreThriller",
  horror: "dashboard.card.genreHorror",
  action: "dashboard.card.genreAction",
  "sci-fi": "dashboard.card.genreSciFi",
  documentary: "dashboard.card.genreDocumentary",
  other: "dashboard.card.genreOther",
};

const ROLE_LABELS = TEAM_ROLE_LABELS_IT;

const MAX_AVATARS = 3;

export function ProjectCardGrid({ project }: Props) {
  const { t } = useTranslation();
  const formatKey = FORMAT_LABEL_KEYS[project.format];
  const genreKey = project.genre ? GENRE_LABEL_KEYS[project.genre] : undefined;
  const meta = [
    formatKey ? t(formatKey) : project.format,
    project.genre ? (genreKey ? t(genreKey) : project.genre) : null,
    ROLE_LABELS[project.role],
  ]
    .filter(Boolean)
    .join(" · ");

  const visibleAvatars = project.collaborators.slice(0, MAX_AVATARS);
  const overflow = project.collaborators.length - visibleAvatars.length;

  return (
    <article className={styles.card}>
      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className={styles.cardLink}
        aria-label={`${t("dashboard.card.openProject")} ${project.title}`}
      />

      <header className={styles.head}>
        <ProjectCoverGradient
          gradient={project.coverGradient}
          title={project.title}
          size="md"
        />
        <span className={styles.roleTag} aria-hidden="true">
          {ROLE_LABELS[project.role]}
        </span>
      </header>

      <div className={styles.titleBlock}>
        <h3 className={styles.title}>{project.title}</h3>
        <div className={styles.eyebrow}>{meta}</div>
      </div>

      <dl
        className={styles.kpis}
        aria-label={`${t("dashboard.card.statsLabel")} ${project.title}`}
      >
        <div className={styles.kpi}>
          <dt className={styles.kpiLbl}>{t("dashboard.card.kpiScenes")}</dt>
          <dd className={styles.kpiNum} data-num>
            {project.stats.sceneCount > 0 ? project.stats.sceneCount : "—"}
          </dd>
        </div>
        <div className={styles.kpi}>
          <dt className={styles.kpiLbl}>{t("dashboard.card.kpiPages")}</dt>
          <dd className={styles.kpiNum} data-num>
            {project.stats.pageCount > 0 ? `${project.stats.pageCount}p` : "—"}
          </dd>
        </div>
        <div className={styles.kpi}>
          <dt className={styles.kpiLbl}>{t("dashboard.card.kpiComplete")}</dt>
          <dd className={styles.kpiNum} data-num>
            {project.stats.completionPercent}%
          </dd>
        </div>
        <div className={styles.kpi}>
          <dt className={styles.kpiLbl}>{t("dashboard.card.kpiDays")}</dt>
          <dd className={styles.kpiNum} data-num>
            {project.stats.scheduledDays > 0
              ? project.stats.scheduledDays
              : "—"}
          </dd>
        </div>
      </dl>

      <div
        className={styles.progress}
        role="progressbar"
        aria-valuenow={project.stats.completionPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${project.stats.completionPercent}${t("dashboard.card.completeAria")}`}
      >
        <i style={{ inlineSize: `${project.stats.completionPercent}%` }} />
      </div>

      <footer className={styles.foot}>
        {visibleAvatars.length > 0 ? (
          <div className={styles.avatars}>
            {visibleAvatars.map((c) => (
              <Avatar
                key={c.id}
                name={c.name}
                src={c.avatarUrl}
                size="sm"
                className={styles.avatar}
              />
            ))}
            {overflow > 0 && (
              <span className={styles.avatarMore} aria-label={`+${overflow}`}>
                +{overflow}
              </span>
            )}
          </div>
        ) : (
          <span className={styles.solo}>{t("dashboard.card.solo")}</span>
        )}
        <Link
          to="/projects/$id/screenplay"
          params={{ id: project.id }}
          className={styles.editorLink}
          aria-label={`${t("dashboard.card.openEditor")} ${project.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          {t("dashboard.card.editorLink")}
        </Link>
      </footer>
    </article>
  );
}
