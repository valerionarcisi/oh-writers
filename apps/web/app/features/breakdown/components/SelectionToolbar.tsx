import { useEffect } from "react";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  type BreakdownCategory,
} from "@oh-writers/domain";
import styles from "./SelectionToolbar.module.css";

interface Props {
  x: number;
  y: number;
  selectedText: string;
  onTag: (category: BreakdownCategory, text: string) => void;
  onDismiss: () => void;
}

export function SelectionToolbar({
  x,
  y,
  selectedText,
  onTag,
  onDismiss,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  return (
    <div
      className={styles.toolbar}
      style={{ left: x, top: y }}
      role="toolbar"
      aria-label="Tag selection"
      data-testid="selection-toolbar"
    >
      {BREAKDOWN_CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          className={styles.btn}
          onClick={() => onTag(cat, selectedText)}
          data-testid={`selection-toolbar-${cat}`}
          title={CATEGORY_META[cat].labelEn}
        >
          {CATEGORY_META[cat].labelIt}
        </button>
      ))}
    </div>
  );
}
