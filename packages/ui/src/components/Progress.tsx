import styles from "./Progress.module.css";
import { toPercent } from "./progress-math.js";

export interface ProgressProps {
  /** Current value (clamped to [0, max]). Omit for indeterminate state. */
  value?: number;
  /** Maximum value. Defaults to 100. */
  max?: number;
  /** Accessible label, required for screen readers. */
  label: string;
  className?: string;
  "data-testid"?: string;
}

export function Progress({
  value,
  max = 100,
  label,
  className,
  ...rest
}: ProgressProps) {
  const isIndeterminate = value === undefined;
  const percent = isIndeterminate ? 0 : toPercent(value, max);

  const classes = [
    styles.progress,
    isIndeterminate ? styles.indeterminate : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={isIndeterminate ? undefined : value}
      data-testid={rest["data-testid"]}
    >
      <span
        className={styles.bar}
        style={isIndeterminate ? undefined : { inlineSize: `${percent}%` }}
      />
    </div>
  );
}
