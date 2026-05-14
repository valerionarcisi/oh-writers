// packages/ui/src/composites/HeroKPI/HeroKPI.tsx
import styles from "./HeroKPI.module.css";

export type DeltaDirection = "positive" | "negative" | "neutral";

export type HeroKPIProps = {
  eyebrow: string;
  value: string;
  size?: "lg" | "sm";
  delta?: string;
  deltaDirection?: DeltaDirection;
  sub?: string;
};

const deltaClass: Record<DeltaDirection, string> = {
  positive: styles.deltaPositive as string,
  negative: styles.deltaNegative as string,
  neutral: styles.deltaNeutral as string,
};

export function HeroKPI({
  eyebrow,
  value,
  size = "lg",
  delta,
  deltaDirection = "neutral",
  sub,
}: HeroKPIProps) {
  return (
    <div className={styles.hero}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <div className={styles.valueRow}>
        <span
          className={[styles.value, size === "sm" ? styles.valueSm : ""]
            .filter(Boolean)
            .join(" ")}
          data-num
        >
          {value}
        </span>
        {delta && (
          <span className={[styles.delta, deltaClass[deltaDirection]].join(" ")}>
            {delta}
          </span>
        )}
      </div>
      {sub && <p className={styles.sub}>{sub}</p>}
    </div>
  );
}
