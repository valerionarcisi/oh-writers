import type { ScenarioView } from "../server/shooting-plan.server";
import styles from "./ScenarioTabs.module.css";

interface ScenarioTabsProps {
  scenarios: ScenarioView[];
  activeScenarioId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export function ScenarioTabs({
  scenarios,
  activeScenarioId,
  onSelect,
  onAdd,
}: ScenarioTabsProps) {
  return (
    <div className={styles.tabs}>
      {scenarios.map((sc) => (
        <button
          key={sc.id}
          type="button"
          className={styles.tab}
          data-active={sc.id === activeScenarioId || undefined}
          onClick={() => onSelect(sc.id)}
        >
          {sc.name}
          <span className={styles.duration}>{sc.totalMinutes}m</span>
        </button>
      ))}
      <button type="button" className={styles.addTab} onClick={onAdd}>
        + scenario
      </button>
    </div>
  );
}
