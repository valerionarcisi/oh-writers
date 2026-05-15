import type { Project } from "@oh-writers/db";
import { Button, DropdownMenu } from "@oh-writers/ui";
import styles from "./ProjectHero.module.css";

const FORMAT_LABELS: Record<string, string> = {
  feature: "Lungometraggio",
  short: "Cortometraggio",
  series_episode: "Episodio serie",
  pilot: "Pilota",
};

const GENRE_LABELS: Record<string, string> = {
  drama: "Dramma",
  comedy: "Commedia",
  thriller: "Thriller",
  horror: "Horror",
  action: "Azione",
  "sci-fi": "Sci-fi",
  documentary: "Documentario",
  other: "Altro",
};

interface ProjectHeroProps {
  readonly project: Project;
  readonly onContinueScreenplay: () => void;
  readonly onOpenTitlePage: () => void;
  readonly onOpenSettings: () => void;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
  readonly onDelete: () => void;
  readonly isMutating: boolean;
}

export function ProjectHero({
  project,
  onContinueScreenplay,
  onOpenTitlePage,
  onOpenSettings,
  onArchive,
  onRestore,
  onDelete,
  isMutating,
}: ProjectHeroProps) {
  const menuItems = project.isArchived
    ? [
        { label: "Frontespizio", onClick: onOpenTitlePage },
        { label: "Impostazioni", onClick: onOpenSettings },
        {
          label: "Ripristina",
          onClick: onRestore,
          disabled: isMutating,
        },
        {
          label: "Elimina",
          onClick: onDelete,
          disabled: isMutating,
        },
      ]
    : [
        { label: "Frontespizio", onClick: onOpenTitlePage },
        { label: "Impostazioni", onClick: onOpenSettings },
        {
          label: "Archivia",
          onClick: onArchive,
          disabled: isMutating,
        },
      ];

  const formatLabel =
    FORMAT_LABELS[project.format] ?? project.format.replace("_", " ");
  const genreLabel = project.genre ? GENRE_LABELS[project.genre] : null;
  const scopeLabel = project.teamId ? "Team" : "Personale";

  return (
    <header className={styles.hero}>
      <div className={styles.main}>
        <div className={styles.eyebrow}>
          <span>{formatLabel}</span>
          <span className={styles.dot}>·</span>
          {genreLabel && (
            <>
              <span>{genreLabel}</span>
              <span className={styles.dot}>·</span>
            </>
          )}
          <span>{scopeLabel}</span>
          {project.isArchived && (
            <>
              <span className={styles.dot}>·</span>
              <span className={styles.warn}>Archiviato</span>
            </>
          )}
        </div>
        <h1 className={styles.title}>{project.title}</h1>
      </div>
      <div className={styles.actions}>
        <Button
          variant="primary"
          size="md"
          onClick={onContinueScreenplay}
          data-testid="overview-continue-screenplay"
        >
          Continua sceneggiatura →
        </Button>
        <DropdownMenu
          trigger={
            <button
              type="button"
              className={styles.kebab}
              aria-label="Altre azioni"
            >
              ⋯
            </button>
          }
          align="end"
          items={menuItems}
          data-testid="overview-actions-menu"
        />
      </div>
    </header>
  );
}
