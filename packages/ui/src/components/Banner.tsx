import type { ReactNode } from "react";
import styles from "./Banner.module.css";

export type BannerVariant = "info" | "cesare" | "warning";

export interface BannerAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export interface BannerProps {
  variant: BannerVariant;
  message: ReactNode;
  actions?: BannerAction[];
  onDismiss?: () => void;
  className?: string;
  "data-testid"?: string;
}

const ICONS: Record<BannerVariant, string> = {
  info: "ℹ",
  cesare: "✨",
  warning: "⚠",
};

export function Banner({
  variant,
  message,
  actions,
  onDismiss,
  className,
  ...rest
}: BannerProps) {
  const classes = [styles.banner, styles[variant], className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role={variant === "warning" ? "alert" : "status"}
      data-testid={rest["data-testid"]}
    >
      <span className={styles.icon} aria-hidden>
        {ICONS[variant]}
      </span>
      <span className={styles.message}>{message}</span>
      {(actions?.length || onDismiss) && (
        <div className={styles.actions}>
          {actions?.map((a) => {
            const actionClasses = [
              styles.action,
              a.variant === "primary" ? styles.primary : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={a.label}
                type="button"
                className={actionClasses}
                onClick={a.onClick}
              >
                {a.label}
              </button>
            );
          })}
          {onDismiss && (
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Chiudi"
              onClick={onDismiss}
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
