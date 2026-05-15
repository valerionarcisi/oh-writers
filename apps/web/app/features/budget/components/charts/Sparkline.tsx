import styles from "./Sparkline.module.css";

interface SparklineProps {
  readonly values: ReadonlyArray<number>;
  readonly colorVar: string;
  readonly ariaLabel?: string;
}

export function Sparkline({ values, colorVar, ariaLabel }: SparklineProps) {
  if (values.length === 0) {
    return (
      <div
        className={styles.root}
        style={{ ["--cat-color" as string]: `var(${colorVar})` }}
        aria-label={ariaLabel}
      />
    );
  }
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  return (
    <div
      className={styles.root}
      style={{ ["--cat-color" as string]: `var(${colorVar})` }}
      aria-label={ariaLabel}
    >
      {values.map((v, i) => {
        const height = max > 0 ? Math.max(8, (v / max) * 100) : 8;
        const isLast = i === values.length - 1;
        return (
          <span
            key={i}
            className={isLast ? styles.barLast : styles.bar}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}
