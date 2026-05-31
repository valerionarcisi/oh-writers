import { Link } from "@tanstack/react-router";
import { Avatar } from "@oh-writers/ui";
import { TEAM_ROLE_LABELS_IT } from "@oh-writers/domain";
import type { DashboardProject } from "../../dashboard.schema";
import { ProjectCoverGradient } from "./ProjectCoverGradient";
import styles from "./ProjectCardGrid.module.css";

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

const ROLE_LABELS = TEAM_ROLE_LABELS_IT;

const MAX_AVATARS = 3;

export function ProjectCardGrid({ project }: Props) {
  const meta = [
    FORMAT_LABELS[project.format] ?? project.format,
    project.genre ? (GENRE_LABELS[project.genre] ?? project.genre) : null,
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
        aria-label={`Apri il progetto ${project.title}`}
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
        aria-label={`Statistiche del progetto ${project.title}`}
      >
        <div className={styles.kpi}>
          <dt className={styles.kpiLbl}>Scene</dt>
          <dd className={styles.kpiNum} data-num>
            {project.stats.sceneCount > 0 ? project.stats.sceneCount : "—"}
          </dd>
        </div>
        <div className={styles.kpi}>
          <dt className={styles.kpiLbl}>Pagine</dt>
          <dd className={styles.kpiNum} data-num>
            {project.stats.pageCount > 0 ? `${project.stats.pageCount}p` : "—"}
          </dd>
        </div>
        <div className={styles.kpi}>
          <dt className={styles.kpiLbl}>Completo</dt>
          <dd className={styles.kpiNum} data-num>
            {project.stats.completionPercent}%
          </dd>
        </div>
        <div className={styles.kpi}>
          <dt className={styles.kpiLbl}>Giornate</dt>
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
        aria-label={`${project.stats.completionPercent}% completo`}
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
          <span className={styles.solo}>Solo</span>
        )}
        <Link
          to="/projects/$id/screenplay"
          params={{ id: project.id }}
          className={styles.editorLink}
          aria-label={`Apri l'editor di ${project.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          Editor →
        </Link>
      </footer>
    </article>
  );
}
