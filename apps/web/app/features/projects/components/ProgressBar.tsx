import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
}

export function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const percentage = Math.min(100, Math.round((value / max) * 100));

  return (
    <div className={styles.wrapper}>
      {label && (
        <div className={styles.label}>
          <span>{label}</span>
          <span>{percentage}%</span>
        </div>
      )}
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
      >
        <div className={styles.fill} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
