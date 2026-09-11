// packages/ui/src/shell/Viewbar/Viewbar.tsx
import type { ReactNode } from "react";
import styles from "./Viewbar.module.css";

export type ViewbarProps = {
  children: ReactNode;
  isScrolled?: boolean;
  className?: string;
  /** Aria-label for the viewbar nav landmark. Defaults to EN so the
   *  viewbar renders correctly without a translator. */
  ariaLabel?: string;
};

export function Viewbar({
  children,
  isScrolled = false,
  className,
  ariaLabel = "Display options",
}: ViewbarProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={[
        styles.viewbar,
        isScrolled ? styles.isScrolled : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </nav>
  );
}

/** Visual separator between viewbar groups */
export function ViewbarSep() {
  return <span className={styles.sep} aria-hidden="true" />;
}
