import { useState } from "react";
import type { NextStep } from "../../server/project-overview.server";
import styles from "./NextStepBanner.module.css";

interface NextStepBannerProps {
  readonly nextStep: NextStep;
  readonly onApply: () => void;
}

export function NextStepBanner({ nextStep, onApply }: NextStepBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <aside
      className={styles.banner}
      role="status"
      aria-label="Suggerimento di Cesare"
      data-testid="overview-next-step"
    >
      <div className={styles.icon} aria-hidden>
        C
      </div>
      <div className={styles.body}>
        <div className={styles.label}>Cesare suggerisce</div>
        <p className={styles.message}>{nextStep.suggestion}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={onApply}
            data-testid="overview-next-step-apply"
          >
            {nextStep.actionLabel}
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => setDismissed(true)}
          >
            Più tardi
          </button>
        </div>
      </div>
    </aside>
  );
}
