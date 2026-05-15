import { Fragment, type ReactNode } from "react";
import styles from "./MetaBar.module.css";

export type MetaBarItem = {
  readonly id?: string;
  /** Eyebrow label (e.g. "Scena", "Pag.", "Elementi"). Rendered muted. */
  readonly label?: string;
  /** Value (e.g. "1", "1/9", "25"). Rendered prominent. */
  readonly value: ReactNode;
};

export type MetaBarProps = {
  /** Items rendered inline separated by mid-dots. */
  readonly items: ReadonlyArray<MetaBarItem>;
  /** Optional content rendered on the right (e.g. action chip). */
  readonly trailing?: ReactNode;
  readonly className?: string;
};

/**
 * Thin mono meta-row that sits above the Viewbar. Shows eyebrow info
 * contextual to the page (scene / pages / element count, characters,
 * cartelle, etc). Same typewriter language as the Variant 1 viewbar so the
 * two strips read as a single coherent header.
 *
 * Convention: keep it short (≤4 items). Bigger payload → use DocStats footer
 * instead of cramming the top.
 */
export function MetaBar({ items, trailing, className }: MetaBarProps) {
  if (items.length === 0 && !trailing) return null;
  return (
    <div className={`${styles.bar}${className ? ` ${className}` : ""}`}>
      <div className={styles.items}>
        {items.map((item, idx) => (
          <Fragment key={item.id ?? `${idx}-${item.label ?? ""}`}>
            {idx > 0 ? <span className={styles.sep} aria-hidden>·</span> : null}
            <span className={styles.item}>
              {item.label ? (
                <span className={styles.label}>{item.label}</span>
              ) : null}
              <span className={styles.value}>{item.value}</span>
            </span>
          </Fragment>
        ))}
      </div>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </div>
  );
}
