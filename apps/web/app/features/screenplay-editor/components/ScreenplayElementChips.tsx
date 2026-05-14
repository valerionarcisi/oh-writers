import type { ElementType } from "../lib/fountain-element-detector";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayElementChipsProps {
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
 * Element conversion chips. Rendered inside the Viewbar so they sit on the
 * same horizontal line as the rest of the page chrome (Indice, draft pill),
 * mirroring the Breakdown V2 'Sottolinea:' chip group.
 */
export function ScreenplayElementChips({
  currentElement,
  onSetElement,
}: ScreenplayElementChipsProps) {
  return (
    <div
      className={styles.elementStrip}
      role="toolbar"
      aria-label="Converti blocco corrente"
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
  );
}
