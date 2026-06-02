import { useTranslation } from "~/features/i18n";
import type { ScenarioView } from "../server/shooting-plan.server";
import styles from "./CesarePlanBanner.module.css";

interface CesarePlanBannerProps {
  scenarios: ScenarioView[];
  activeScenarioId: string | null;
  onConfirm: (scenarioId: string) => void;
}

export function CesarePlanBanner({
  scenarios,
  activeScenarioId,
  onConfirm,
}: CesarePlanBannerProps) {
  const { t } = useTranslation();
  if (scenarios.length < 2) return null;

  return (
    <div
      className={styles.banner}
      role="region"
      aria-label={t("shootingPlan.banner.regionAria")}
    >
      <div className={styles.iconWrap} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M9 6l-6 6 6 6" />
        </svg>
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{t("shootingPlan.banner.title")}</div>
        <div className={styles.sub}>
          {t("shootingPlan.banner.subtitle").replace(
            "{count}",
            String(scenarios.length),
          )}
        </div>
      </div>
      <div className={styles.pills}>
        {scenarios.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={styles.pill}
            data-active={s.id === activeScenarioId || undefined}
            onClick={() => onConfirm(s.id)}
            title={t("shootingPlan.banner.confirmTitle").replace(
              "{name}",
              s.name,
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
