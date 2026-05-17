import { Link } from "@tanstack/react-router";
import { Avatar } from "@oh-writers/ui";
import { TeamRoles } from "@oh-writers/domain";
import type { DashboardProject } from "../../dashboard.schema";
import { ProjectCoverGradient } from "./ProjectCoverGradient";
import styles from "./ProjectCardCompact.module.css";

interface Props {
  readonly project: DashboardProject;
}

const FORMAT_LABELS: Record<string, string> = {
  feature: "Lungo",
  short: "Corto",
  series_episode: "Episodio",
  pilot: "Pilot",
};

const GENRE_LABELS: Record<string, string> = {
  drama: "Drama",
  comedy: "Commedia",
  thriller: "Thriller",
  horror: "Horror",
  action: "Azione",
  "sci-fi": "Sci-fi",
  documentary: "Documentario",
  other: "Altro",
};

const ROLE_LABELS: Record<string, string> = {
  [TeamRoles.OWNER]: "Owner",
  [TeamRoles.EDITOR]: "Editor",
  [TeamRoles.VIEWER]: "Viewer",
};

const MAX_AVATARS = 3;

export function ProjectCardCompact({ project }: Props) {
  const visibleAvatars = project.collaborators.slice(0, MAX_AVATARS);
  const overflow = project.collaborators.length - visibleAvatars.length;
  return (
    <div className={styles.row}>
      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className={styles.rowLink}
        aria-label={`Apri il progetto ${project.title}`}
      />
      <ProjectCoverGradient
        gradient={project.coverGradient}
        title={project.title}
        size="sm"
      />
      <div className={styles.titleCell}>
        <span className={styles.title}>{project.title}</span>
        <span className={styles.meta}>
          {FORMAT_LABELS[project.format] ?? project.format}
          {project.genre
            ? ` · ${GENRE_LABELS[project.genre] ?? project.genre}`
            : ""}
        </span>
      </div>
      <span className={styles.cellNum} data-num>
        {project.stats.sceneCount > 0 ? project.stats.sceneCount : "—"}
        <span className={styles.cellLbl}>scene</span>
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
        <span className={styles.solo}>Solo</span>
      )}
      <span className={styles.roleTag}>{ROLE_LABELS[project.role]}</span>
      <Link
        to="/projects/$id/screenplay"
        params={{ id: project.id }}
        className={styles.editorLink}
        aria-label={`Apri l'editor di ${project.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        Editor →
      </Link>
    </div>
  );
}
