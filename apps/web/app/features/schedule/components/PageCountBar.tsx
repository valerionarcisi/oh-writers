import { pageCountColor, TARGET_PAGES_PER_DAY } from "@oh-writers/domain";
import styles from "./PageCountBar.module.css";

interface PageCountBarProps {
  pages: number;
}

export function PageCountBar({ pages }: PageCountBarProps) {
  const color = pageCountColor(pages);
  const pct = Math.min(100, (pages / (TARGET_PAGES_PER_DAY * 1.5)) * 100);
  return (
    <div>
      <div className={styles.bar}>
        <div
          className={styles.fill}
          data-color={color}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={styles.label}>{pages} pag.</div>
    </div>
  );
}
