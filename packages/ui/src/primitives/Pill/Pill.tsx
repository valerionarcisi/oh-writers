import type { ReactNode } from "react";
import styles from "./Pill.module.css";

export type PillTone = "clay" | "leaf" | "neutral";
export type PillSize = "sm" | "md";

export type PillProps = {
  tone: PillTone;
  size?: PillSize;
  count?: number;
  children: ReactNode;
  className?: string;
};

export function Pill({ tone, size = "md", count, children, className }: PillProps) {
  return (
    <span
      className={[
        styles.pill,
        styles[tone],
        size === "sm" ? styles.sm : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
      {count != null && count > 0 && (
        <span className={styles.count} aria-label={`${count} elementi`}>
          {count}
        </span>
      )}
    </span>
  );
}
