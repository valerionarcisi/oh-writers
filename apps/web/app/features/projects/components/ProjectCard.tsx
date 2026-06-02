import { Link } from "@tanstack/react-router";
import { Badge } from "@oh-writers/ui";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
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
const FORMAT_LABEL_KEYS: Record<string, TranslationKey> = {
  feature: "projects.format.feature",
  short: "projects.format.short",
  series_episode: "projects.format.seriesEpisode",
  pilot: "projects.format.pilot",
};

const GENRE_LABEL_KEYS: Record<string, TranslationKey> = {
  drama: "projects.card.genreDrama",
  comedy: "projects.card.genreComedy",
  thriller: "projects.card.genreThriller",
  horror: "projects.card.genreHorror",
  action: "projects.card.genreAction",
  "sci-fi": "projects.card.genreSciFi",
  documentary: "projects.card.genreDocumentary",
  other: "projects.card.genreOther",
};

const formatDate = (date: Date | string): string =>
  new Intl.DateTimeFormat("it-IT", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));

export function ProjectCard({ project }: ProjectCardProps) {
  const { t } = useTranslation();
  const formatKey = FORMAT_LABEL_KEYS[project.format];
  const genreKey = project.genre ? GENRE_LABEL_KEYS[project.genre] : undefined;
  return (
    <Link
      to="/projects/$id"
      params={{ id: project.id }}
      className={`${styles.card} ${project.isArchived ? styles.archived : ""}`}
    >
      <div className={styles.header}>
        <span className={styles.title}>{project.title}</span>
        {project.isArchived && (
          <Badge variant="outline">{t("projects.card.archived")}</Badge>
        )}
      </div>

      <div className={styles.meta}>
        <span className={styles.format}>
          {[
            formatKey ? t(formatKey) : project.format.replace("_", " "),
            project.genre ? (genreKey ? t(genreKey) : project.genre) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {project.teamId && (
          <Badge variant="accent">{t("projects.card.team")}</Badge>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.date}>
          {t("projects.card.updated")} {formatDate(project.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
