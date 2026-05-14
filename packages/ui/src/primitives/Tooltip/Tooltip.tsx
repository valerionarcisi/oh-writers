// packages/ui/src/primitives/Tooltip/Tooltip.tsx
import type { ReactNode } from "react";
import styles from "./Tooltip.module.css";

export type TooltipKind = "dark" | "info";
export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
  content: ReactNode;
  kind?: TooltipKind;
  placement?: TooltipPlacement;
  children: ReactNode;
};

export function Tooltip({
  content,
  kind = "dark",
  placement = "top",
  children,
}: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      {children}
      <span
        role="tooltip"
        className={[
          styles.tip,
          kind === "info" ? styles.info : "",
          styles[placement],
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {content}
      </span>
    </span>
  );
}
