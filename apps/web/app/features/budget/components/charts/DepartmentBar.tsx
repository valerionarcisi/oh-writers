import styles from "./DepartmentBar.module.css";

export interface BarDatum {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly formattedValue: string;
  readonly percent: number;
  readonly colorVar: string;
}

interface DepartmentBarProps {
  readonly data: ReadonlyArray<BarDatum>;
  readonly maxValue?: number;
}

export function DepartmentBar({ data, maxValue }: DepartmentBarProps) {
  if (data.length === 0) {
    return (
      <div className={styles.empty}>
        Nessun dato disponibile per il grafico.
      </div>
    );
  }
  const max = maxValue ?? data.reduce((m, d) => Math.max(m, d.value), 0);

  return (
    <ul className={styles.rows}>
      {data.map((d) => {
        const width = max > 0 ? Math.max(2, (d.value / max) * 100) : 0;
        return (
          <li
            key={d.id}
            className={styles.row}
            style={{ ["--cat-color" as string]: `var(${d.colorVar})` }}
          >
            <span className={styles.label}>{d.label}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.fill} style={{ width: `${width}%` }} />
            </span>
            <span className={styles.values}>
              <span className={styles.value}>{d.formattedValue}</span>
              <span className={styles.percent}>{d.percent.toFixed(0)}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
