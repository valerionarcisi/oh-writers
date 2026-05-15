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
const FORMAT_LABELS: Record<string, string> = {
  feature: "lungometraggio",
  short: "cortometraggio",
  series_episode: "episodio serie",
  pilot: "pilota",
};

const GENRE_LABELS: Record<string, string> = {
  drama: "dramma",
  comedy: "commedia",
  thriller: "thriller",
  horror: "horror",
  action: "azione",
  "sci-fi": "sci-fi",
  documentary: "documentario",
  other: "altro",
};

const formatDate = (date: Date | string): string =>
  new Intl.DateTimeFormat("it-IT", {
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
        {project.isArchived && <Badge variant="outline">Archiviato</Badge>}
      </div>

      <div className={styles.meta}>
        <span className={styles.format}>
          {[
            FORMAT_LABELS[project.format] ?? project.format.replace("_", " "),
            project.genre ? (GENRE_LABELS[project.genre] ?? project.genre) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {project.teamId && <Badge variant="accent">Team</Badge>}
      </div>

      <div className={styles.footer}>
        <span className={styles.date}>
          Aggiornato {formatDate(project.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
