import { useNavigate } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import { DashboardImportFountainButton } from "./DashboardImportFountainButton";
import { DashboardImportPdfButton } from "./DashboardImportPdfButton";
import { useTranslation } from "~/features/i18n";
import styles from "./DashboardHero.module.css";

interface HeroStats {
  readonly activeCount: number;
  readonly totalScenes: number;
  readonly totalDays: number;
  readonly lastEditLabel: string;
}

interface Props {
  readonly stats: HeroStats;
}

export function DashboardHero({ stats }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section className={styles.hero}>
      <div className={styles.left}>
        <h1 className={styles.title}>{t("dashboard.hero.title")}</h1>
        <div
          className={styles.strip}
          aria-label={t("dashboard.hero.summaryLabel")}
        >
          <b data-num>{stats.activeCount}</b>{" "}
          {t("dashboard.hero.activeProjects")}{" "}
          <b data-num>{stats.totalScenes}</b> {t("dashboard.hero.totalScenes")}{" "}
          <b data-num>{stats.totalDays}</b>{" "}
          {t("dashboard.hero.daysAndLastEdit")} <b>{stats.lastEditLabel}</b>
        </div>
      </div>
      <div className={styles.actions}>
        <DashboardImportFountainButton />
        <DashboardImportPdfButton />
        <Button
          variant="primary"
          type="button"
          onClick={() => navigate({ to: "/projects/new" })}
        >
          {t("dashboard.hero.newProject")}
        </Button>
      </div>
    </section>
  );
}
