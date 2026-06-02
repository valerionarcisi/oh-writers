import type { CSSProperties } from "react";
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
  scene: "var(--ds-cat-locations, #b07a3a)",
  action: "var(--ds-text-3, #8a8479)",
  character: "var(--ds-cat-cast, #6c4d8c)",
  dialogue: "var(--ds-action, #b04a2a)",
  parenthetical: "var(--ds-cat-costumi, #c98a8a)",
  transition: "var(--ds-cat-suono, #5a8a6a)",
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
  const { t } = useTranslation();
  return (
    <div
      className={styles.elementStrip}
      role="toolbar"
      aria-label={t("screenplay.chip.convertBlockAria")}
    >
      {ELEMENT_ORDER.map((el) => {
        const isActive = currentElement === el;
        const label = t(ELEMENT_LABEL_KEY[el]);
        return (
          <button
            key={el}
            type="button"
            className={`${styles.elementChip} ${isActive ? styles.elementChipActive : ""}`}
            style={{ "--chip-accent": ELEMENT_COLORS[el] } as CSSProperties}
            data-color={ELEMENT_COLORS[el]}
            title={`${label} (${ELEMENT_SHORTCUTS[el]})`}
            aria-pressed={isActive}
            onClick={() => onSetElement(el)}
          >
            <span className={styles.chipDot} aria-hidden="true" />
            <span className={styles.chipLabel}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
