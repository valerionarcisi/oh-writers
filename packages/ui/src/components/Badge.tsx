import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type Variant = "default" | "accent" | "outline";

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function Badge({
  variant = "default",
  children,
  className,
}: BadgeProps) {
  const classes = [styles.badge, styles[variant], className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{children}</span>;
}
