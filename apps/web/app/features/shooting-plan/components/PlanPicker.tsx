import { useState } from "react";
import type { ScenarioView } from "../server/shooting-plan.server";
import styles from "./PlanPicker.module.css";

interface PlanPickerProps {
  scenarios: ScenarioView[];
  visibleScenarioIds: Set<string>;
  onToggleVisible: (scenarioId: string) => void;
  onCreatePlan: (init: "empty" | "copy" | "pattern") => void;
}

export function PlanPicker({
  scenarios,
  visibleScenarioIds,
  onToggleVisible,
  onCreatePlan,
}: PlanPickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <div className={styles.root} role="group" aria-label="Selezione piani visibili">
      <span className={styles.label}>Mostra:</span>
      {scenarios.map((s) => {
        const visible = visibleScenarioIds.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={styles.pill}
            data-visible={visible || undefined}
            onClick={() => onToggleVisible(s.id)}
          >
            <span className={styles.check}>{visible ? "✓" : "○"}</span>
            <span>{s.name}</span>
          </button>
        );
      })}

      <div className={styles.addWrap}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setPopoverOpen((o) => !o)}
        >
          + piano
        </button>
        {popoverOpen && (
          <div className={styles.popover} role="menu">
            <div className={styles.popoverLabel}>Crea Piano come:</div>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("empty");
              }}
            >
              Vuoto
            </button>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("copy");
              }}
              disabled={scenarios.length === 0}
            >
              Copia piano attivo
            </button>
            <button
              type="button"
              className={styles.popoverItem}
              onClick={() => {
                setPopoverOpen(false);
                onCreatePlan("pattern");
              }}
            >
              Da pattern…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
