import type { CSSProperties, ReactNode } from "react";
import styles from "./Tag.module.css";

export type TagVariant = "solid" | "ghost";

export interface TagProps {
  colorToken: string;
  icon: ReactNode;
  name: string;
  count?: number;
  variant?: TagVariant;
  onClick?: () => void;
  onDismiss?: () => void;
  className?: string;
  "data-testid"?: string;
}

export function Tag({
  colorToken,
  icon,
  name,
  count,
  variant = "solid",
  onClick,
  onDismiss,
  className,
  ...rest
}: TagProps) {
  const classes = [
    styles.tag,
    variant === "ghost" ? styles.ghost : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      style={{ "--tag-color": `var(${colorToken})` } as CSSProperties}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-testid={rest["data-testid"]}
    >
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <span className={styles.name}>{name}</span>
      {count !== undefined && count > 1 && (
        <span className={styles.count}>×{count}</span>
      )}
      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          aria-label="Rimuovi"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}
