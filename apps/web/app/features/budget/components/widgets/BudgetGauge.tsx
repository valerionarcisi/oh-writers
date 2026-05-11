import styles from "./BudgetGauge.module.css";

interface BudgetGaugeProps {
  value: number;
  max: number;
  color: string;
  label: string;
}

export function BudgetGauge({ value, max, color, label }: BudgetGaugeProps) {
  const r = 36;
  const cx = 44;
  const cy = 44;
  const circumference = Math.PI * r;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - ratio);

  return (
    <div className={styles.gauge}>
      <svg viewBox="0 0 88 52" aria-hidden="true" className={styles.svg}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--color-surface-raised)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={styles.arc}
        />
      </svg>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
