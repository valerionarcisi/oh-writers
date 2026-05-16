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
  if (scenarios.length < 2) return null;

  return (
    <div className={styles.banner} role="region" aria-label="Conferma piano">
      <div className={styles.iconWrap} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M9 6l-6 6 6 6" />
        </svg>
      </div>
      <div className={styles.body}>
        <div className={styles.title}>Quale piano confermi per la scena?</div>
        <div className={styles.sub}>
          I {scenarios.length} piani sono mutualmente esclusivi — solo uno verrà eseguito. Clicca il numero o seleziona dal track.
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
            title={`Conferma ${s.name}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
