import { useRef, type CSSProperties } from "react";
import { useButton, useToolbar } from "react-aria";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import type { ElementType } from "../lib/fountain-element-detector";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayElementChipsProps {
  currentElement: ElementType;
  onSetElement: (element: ElementType) => void;
}

const ELEMENT_LABEL_KEY: Record<ElementType, TranslationKey> = {
  scene: "screenplay.chip.element.scene",
  action: "screenplay.chip.element.action",
  character: "screenplay.chip.element.character",
  dialogue: "screenplay.chip.element.dialogue",
  parenthetical: "screenplay.chip.element.parenthetical",
  transition: "screenplay.chip.element.transition",
};

const ELEMENT_SHORTCUTS: Record<ElementType, string> = {
  scene: "⌥S",
  action: "⌥A",
  character: "⌥C",
  dialogue: "⌥D",
  parenthetical: "⌥P",
  transition: "⌥T",
};

// One ambient accent per fountain block type. Reuses the breakdown category
// palette so a future reader can visually associate, e.g., "Character" with
// the cast category in the breakdown panel.
const ELEMENT_COLORS: Record<ElementType, string> = {
  scene: "var(--ds-cat-locations)",
  action: "var(--ds-text-3)",
  character: "var(--ds-cat-cast)",
  dialogue: "var(--ds-action)",
  parenthetical: "var(--ds-cat-costumi)",
  transition: "var(--ds-cat-suono)",
};

const ELEMENT_ORDER: ElementType[] = [
  "scene",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
];

interface ElementChipProps {
  element: ElementType;
  label: string;
  isActive: boolean;
  /** Roving tabindex: only the active chip is in the tab order; arrow keys
   *  (handled by `useToolbar`) move focus across the rest. */
  isTabStop: boolean;
  onSelect: () => void;
}

function ElementChip({
  element,
  label,
  isActive,
  isTabStop,
  onSelect,
}: ElementChipProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress: onSelect, "aria-pressed": isActive, elementType: "button" },
    ref,
  );
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      tabIndex={isTabStop ? 0 : -1}
      className={`${styles.elementChip} ${isActive ? styles.elementChipActive : ""}`}
      style={{ "--chip-accent": ELEMENT_COLORS[element] } as CSSProperties}
      title={`${label} (${ELEMENT_SHORTCUTS[element]})`}
      data-element={element}
    >
      <span className={styles.chipDot} aria-hidden="true" />
      <span className={styles.chipLabel}>{label}</span>
    </button>
  );
}

/**
 * Element conversion toolbar. Rendered inside the Viewbar so the chips sit on
 * the same horizontal line as the rest of the page chrome (Indice, draft
 * pill). Uses react-aria's `useToolbar` for arrow-key roving focus across the
 * fountain block types (the previous plain `role="toolbar"` strip had no
 * keyboard navigation — N-19).
 */
export function ScreenplayElementChips({
  currentElement,
  onSetElement,
}: ScreenplayElementChipsProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { toolbarProps } = useToolbar(
    { "aria-label": t("screenplay.chip.convertBlockAria") },
    ref,
  );
  // The active chip is the single tab stop; if the cursor is in a block type
  // not in the strip (it always is one of these), fall back to the first chip.
  const tabStop = ELEMENT_ORDER.includes(currentElement)
    ? currentElement
    : ELEMENT_ORDER[0];
  return (
    <div {...toolbarProps} ref={ref} className={styles.elementStrip}>
      {ELEMENT_ORDER.map((el) => (
        <ElementChip
          key={el}
          element={el}
          label={t(ELEMENT_LABEL_KEY[el])}
          isActive={currentElement === el}
          isTabStop={el === tabStop}
          onSelect={() => onSetElement(el)}
        />
      ))}
    </div>
  );
}
