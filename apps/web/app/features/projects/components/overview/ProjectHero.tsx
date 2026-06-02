import type { Project } from "@oh-writers/db";
import { Button, DropdownMenu } from "@oh-writers/ui";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./ProjectHero.module.css";

const FORMAT_LABEL_KEYS: Record<string, TranslationKey> = {
  feature: "dashboard.filter.formatFeature",
  short: "dashboard.filter.formatShort",
  series_episode: "dashboard.filter.formatSeriesEpisode",
  pilot: "dashboard.filter.formatPilot",
};

const GENRE_LABEL_KEYS: Record<string, TranslationKey> = {
  drama: "projects.genre.drama",
  comedy: "projects.genre.comedy",
  thriller: "projects.genre.thriller",
  horror: "projects.genre.horror",
  action: "projects.genre.action",
  "sci-fi": "projects.genre.sciFi",
  documentary: "projects.genre.documentary",
  other: "projects.genre.other",
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
  const { t } = useTranslation();
  const menuItems = project.isArchived
    ? [
        { label: t("projects.hero.titlePage"), onClick: onOpenTitlePage },
        { label: t("action.settings"), onClick: onOpenSettings },
        {
          label: t("projects.hero.restore"),
          onClick: onRestore,
          disabled: isMutating,
        },
        {
          label: t("action.delete"),
          onClick: onDelete,
          disabled: isMutating,
        },
      ]
    : [
        { label: t("projects.hero.titlePage"), onClick: onOpenTitlePage },
        { label: t("action.settings"), onClick: onOpenSettings },
        {
          label: t("projects.hero.archive"),
          onClick: onArchive,
          disabled: isMutating,
        },
      ];

  const formatKey = FORMAT_LABEL_KEYS[project.format];
  const formatLabel = formatKey
    ? t(formatKey)
    : project.format.replace("_", " ");
  const genreKey = project.genre ? GENRE_LABEL_KEYS[project.genre] : undefined;
  const genreLabel = genreKey ? t(genreKey) : null;
  const scopeLabel = project.teamId
    ? t("projects.hero.scopeTeam")
    : t("projects.hero.scopePersonal");

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
              <span className={styles.warn}>{t("projects.hero.archived")}</span>
            </>
          )}
        </div>
        <h1 className={styles.title}>{project.title}</h1>
      </div>
      <div className={styles.actions}>
        <Button
          variant="primary"
          size="md"
          onPress={onContinueScreenplay}
          data-testid="overview-continue-screenplay"
        >
          {t("projects.hero.continueScreenplay")}
        </Button>
        <DropdownMenu
          trigger={<span aria-hidden>⋯</span>}
          triggerClassName={styles.kebab}
          align="end"
          items={menuItems}
          data-testid="overview-actions-menu"
        />
      </div>
    </header>
  );
}
