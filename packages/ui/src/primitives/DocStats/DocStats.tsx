import styles from "./DocStats.module.css";

export type DocStat =
  | { kind: "chars"; value: number }
  | { kind: "words"; value: number }
  | { kind: "pages"; value: number; approx?: boolean }
  | { kind: "cartelle"; value: number }
  | { kind: "scenes"; value: number };

export type DocStatsLabels = Partial<Record<DocStat["kind"], string>>;

export type DocStatsProps = {
  stats: ReadonlyArray<DocStat>;
  className?: string;
  /** Translated unit labels. Optional — each field defaults to EN
   *  so the component renders correctly without a translator. */
  labels?: DocStatsLabels;
  /** BCP-47 locale for number formatting (e.g. "en" or "it"). */
  numberLocale?: string;
};

const DEFAULT_LABELS: Record<DocStat["kind"], string> = {
  chars: "characters",
  words: "words",
  pages: "pages",
  cartelle: "cartelle",
  scenes: "scenes",
};

const formatNumber = (n: number, locale: string): string =>
  new Intl.NumberFormat(locale).format(n);

const formatValue = (s: DocStat, locale: string): string => {
  const base = formatNumber(s.value, locale);
  if (s.kind === "pages" && s.approx) return `~${base}`;
  return base;
};

export function DocStats({
  stats,
  className,
  labels,
  numberLocale = "en-US",
}: DocStatsProps) {
  if (stats.length === 0) return null;
  return (
    <dl
      className={`${styles.stats}${className ? ` ${className}` : ""}`}
      aria-live="polite"
      data-testid="doc-stats"
    >
      {stats.map((stat) => (
        <div key={stat.kind} className={styles.item} data-stat={stat.kind}>
          <dt className={styles.label}>
            {labels?.[stat.kind] ?? DEFAULT_LABELS[stat.kind]}
          </dt>
          <dd className={styles.value}>{formatValue(stat, numberLocale)}</dd>
        </div>
      ))}
    </dl>
  );
}
