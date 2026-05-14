// packages/ui/src/shell/Viewbar/Viewbar.tsx
import type { ReactNode } from "react";
import styles from "./Viewbar.module.css";

export type ViewbarProps = {
  children: ReactNode;
  isScrolled?: boolean;
  className?: string;
};

export function Viewbar({ children, isScrolled = false, className }: ViewbarProps) {
  return (
    <nav
      aria-label="Opzioni di visualizzazione"
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
