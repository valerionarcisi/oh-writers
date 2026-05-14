import type { ElementType } from "../lib/fountain-element-detector";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayToolbarProps {
  currentElement: ElementType;
  onSetElement: (element: ElementType) => void;
}

const ELEMENT_LABELS: Record<ElementType, string> = {
  scene: "Scene",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Paren",
  transition: "Transition",
};

const ELEMENT_SHORTCUTS: Record<ElementType, string> = {
  scene: "⌥S",
  action: "⌥A",
  character: "⌥C",
  dialogue: "⌥D",
  parenthetical: "⌥P",
  transition: "⌥T",
};

const ELEMENT_ORDER: ElementType[] = [
  "scene",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
];

/**
 * Inline element converter strip. The toolbar is intentionally minimal: only
 * element-type pills. Page-level actions (Export, Focus, Import, Versioni)
 * live in the floating dock at the bottom-right of the editor.
 */
export function ScreenplayToolbar({
  currentElement,
  onSetElement,
}: ScreenplayToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div
        className={styles.elementStrip}
        role="toolbar"
        aria-label="Convert current block"
      >
        {ELEMENT_ORDER.map((el) => (
          <button
            key={el}
            type="button"
            className={`${styles.elementPill} ${currentElement === el ? styles.elementPillActive : ""}`}
            title={`${ELEMENT_LABELS[el]} (${ELEMENT_SHORTCUTS[el]})`}
            aria-pressed={currentElement === el}
            onClick={() => onSetElement(el)}
          >
            {ELEMENT_LABELS[el]}
          </button>
        ))}
      </div>
    </div>
  );
}
