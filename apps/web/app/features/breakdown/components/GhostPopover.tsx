import { useEffect } from "react";
import styles from "./GhostPopover.module.css";

interface Props {
  x: number;
  y: number;
  onAccept: () => void;
  onIgnore: () => void;
  onDismiss: () => void;
}

export function GhostPopover({ x, y, onAccept, onIgnore, onDismiss }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  return (
    <div
      className={styles.popover}
      style={{ left: x, top: y }}
      role="dialog"
      aria-label="Suggerimento Cesare"
      data-testid="ghost-popover"
    >
      <span className={styles.label}>Suggerimento Cesare</span>
      <button
        type="button"
        className={`${styles.btn} ${styles.accept}`}
        data-testid="ghost-popover-accept"
        onClick={onAccept}
      >
        Accetta
      </button>
      <button
        type="button"
        className={styles.btn}
        data-testid="ghost-popover-ignore"
        onClick={onIgnore}
      >
        Ignora
      </button>
    </div>
  );
}
