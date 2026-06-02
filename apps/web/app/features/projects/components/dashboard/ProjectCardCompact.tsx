import { Link } from "@tanstack/react-router";
import { Avatar } from "@oh-writers/ui";
import { TEAM_ROLE_LABELS_IT, type TranslationKey } from "@oh-writers/domain";
import type { DashboardProject } from "../../dashboard.schema";
import { ProjectCoverGradient } from "./ProjectCoverGradient";
import { useTranslation } from "~/features/i18n";
import styles from "./ProjectCardCompact.module.css";

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

export function ProjectCardCompact({ project }: Props) {
  const { t } = useTranslation();
  const formatKey = FORMAT_LABEL_KEYS[project.format];
  const genreKey = project.genre ? GENRE_LABEL_KEYS[project.genre] : undefined;
  const visibleAvatars = project.collaborators.slice(0, MAX_AVATARS);
  const overflow = project.collaborators.length - visibleAvatars.length;
  return (
    <div className={styles.row}>
      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className={styles.rowLink}
        aria-label={`${t("dashboard.card.openProject")} ${project.title}`}
      />
      <ProjectCoverGradient
        gradient={project.coverGradient}
        title={project.title}
        size="sm"
      />
      <div className={styles.titleCell}>
        <span className={styles.title}>{project.title}</span>
        <span className={styles.meta}>
          {formatKey ? t(formatKey) : project.format}
          {project.genre
            ? ` · ${genreKey ? t(genreKey) : project.genre}`
            : ""}
        </span>
      </div>
      <span className={styles.cellNum} data-num>
        {project.stats.sceneCount > 0 ? project.stats.sceneCount : "—"}
        <span className={styles.cellLbl}>{t("dashboard.card.scenes")}</span>
      </span>
      <div className={styles.pctCell}>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuenow={project.stats.completionPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ inlineSize: `${project.stats.completionPercent}%` }} />
        </div>
        <span className={styles.pctNum} data-num>
          {project.stats.completionPercent}%
        </span>
      </div>
      <span className={styles.activity}>{project.lastActivity.label}</span>
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
            <span className={styles.avatarMore}>+{overflow}</span>
          )}
        </div>
      ) : (
        <span className={styles.solo}>{t("dashboard.card.solo")}</span>
      )}
      <span className={styles.roleTag}>{ROLE_LABELS[project.role]}</span>
      <Link
        to="/projects/$id/screenplay"
        params={{ id: project.id }}
        className={styles.editorLink}
        aria-label={`${t("dashboard.card.openEditor")} ${project.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        {t("dashboard.card.editorLink")}
      </Link>
    </div>
  );
}
