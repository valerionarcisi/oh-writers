// apps/web/app/features/predictions/components/NextStepChip.tsx
//
// Spec 50 (Part 2) — the single next-step suggestion affordance inside the
// Cesare chat. Renders ONE button derived from `nextNarrativeStep`. Clicking it
// seeds the suggestion's natural-language prompt through the existing send path
// (one generation, never a chain). The user can ignore it and type freely.
//
// react-aria `useButton` drives focus + keyboard activation (mandatory per the
// project's interaction-primitive rule).

import { useRef } from "react";
import { useButton } from "react-aria";
import type { NextStepSuggestion } from "../narrative-next-step";
import styles from "./NextStepChip.module.css";

export interface NextStepChipProps {
  readonly suggestion: NextStepSuggestion;
  /** Seeds the suggestion prompt through the chat's send pipeline. */
  readonly onPick: (prompt: string) => void;
  /** Disabled while a generation is already running. */
  readonly isDisabled?: boolean;
}

export function NextStepChip({
  suggestion,
  onPick,
  isDisabled = false,
}: NextStepChipProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: () => onPick(suggestion.prompt),
      isDisabled,
      "aria-label": `Prossimo passo: ${suggestion.chipLabel}`,
    },
    ref,
  );

  return (
    <div className={styles.wrap} data-testid="cesare-next-step">
      <span className={styles.kicker}>Prossimo passo</span>
      <button
        {...buttonProps}
        ref={ref}
        type="button"
        className={styles.chip}
        data-step={suggestion.step}
        data-testid="cesare-next-step-chip"
      >
        <span className={styles.spark} aria-hidden="true">
          ✦
        </span>
        <span className={styles.label}>{suggestion.chipLabel}</span>
      </button>
    </div>
  );
}
