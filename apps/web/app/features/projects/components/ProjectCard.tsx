import { Link } from "@tanstack/react-router";
import { Badge } from "@oh-writers/ui";
import styles from "./ProjectCard.module.css";

interface ProjectCardProps {
  project: {
    id: string;
    title: string;
    format: string;
    genre: string | null;
    teamId: string | null;
    isArchived: boolean;
    updatedAt: Date | string;
  };
}

// tRPC HTTP transport serializes Date → string; new Date() handles both
const formatDate = (date: Date | string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      to="/projects/$id"
      params={{ id: project.id }}
      className={`${styles.card} ${project.isArchived ? styles.archived : ""}`}
    >
      <div className={styles.header}>
        <span className={styles.title}>{project.title}</span>
        {project.isArchived && <Badge variant="outline">Archived</Badge>}
      </div>

      <div className={styles.meta}>
        <span className={styles.format}>
          {[project.format.replace("_", " "), project.genre]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {project.teamId && <Badge variant="accent">Team</Badge>}
      </div>

      <div className={styles.footer}>
        <span className={styles.date}>
          Updated {formatDate(project.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
