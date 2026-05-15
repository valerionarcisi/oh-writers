import styles from "./DocStats.module.css";

export type DocStat =
  | { kind: "chars"; value: number }
  | { kind: "words"; value: number }
  | { kind: "pages"; value: number; approx?: boolean }
  | { kind: "cartelle"; value: number }
  | { kind: "scenes"; value: number };

export type DocStatsProps = {
  stats: ReadonlyArray<DocStat>;
  className?: string;
};

const labels: Record<DocStat["kind"], string> = {
  chars: "caratteri",
  words: "parole",
  pages: "pagine",
  cartelle: "cartelle",
  scenes: "scene",
};

const formatNumber = (n: number): string =>
  new Intl.NumberFormat("it-IT").format(n);

const formatValue = (s: DocStat): string => {
  const base = formatNumber(s.value);
  if (s.kind === "pages" && s.approx) return `~${base}`;
  return base;
};

export function DocStats({ stats, className }: DocStatsProps) {
  if (stats.length === 0) return null;
  return (
    <dl
      className={`${styles.stats}${className ? ` ${className}` : ""}`}
      aria-live="polite"
      data-testid="doc-stats"
    >
      {stats.map((stat) => (
        <div
          key={stat.kind}
          className={styles.item}
          data-stat={stat.kind}
        >
          <dt className={styles.label}>{labels[stat.kind]}</dt>
          <dd className={styles.value}>{formatValue(stat)}</dd>
        </div>
      ))}
    </dl>
  );
}
