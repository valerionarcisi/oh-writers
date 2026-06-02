import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import type { ElementType } from "../lib/fountain-element-detector";
import styles from "./ScreenplayToolbar.module.css";

interface ScreenplayToolbarProps {
  currentElement: ElementType;
  onSetElement: (element: ElementType) => void;
}

const ELEMENT_LABEL_KEY: Record<ElementType, TranslationKey> = {
  scene: "screenplay.toolbar.element.scene",
  action: "screenplay.toolbar.element.action",
  character: "screenplay.toolbar.element.character",
  dialogue: "screenplay.toolbar.element.dialogue",
  parenthetical: "screenplay.toolbar.element.parenthetical",
  transition: "screenplay.toolbar.element.transition",
};

// Keyboard shortcuts shown in hover tooltips — Mod maps to ⌘ on Mac / Ctrl elsewhere.
const ELEMENT_SHORTCUTS: Record<ElementType, string> = {
  scene: "⌘1 / ⌥S",
  action: "⌘2 / ⌥A",
  character: "⌘3 / ⌥C",
  dialogue: "⌘4 / ⌥D",
  parenthetical: "⌘5 / ⌥P",
  transition: "⌘6 / ⌥T",
};

// Unicode symbols used as visual icons. No external icon library.
const ELEMENT_ICONS: Record<ElementType, string> = {
  scene: "▲",
  action: "⬤",
  character: "C",
  dialogue: "D",
  parenthetical: "P",
  transition: "→",
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
 * element-type icon buttons. Page-level actions (Export, Focus, Import, Versioni)
 * live in the floating dock at the bottom-right of the editor.
 *
 * The active element receives a colored bottom border to make the current
 * block type immediately legible while keeping the strip visually quiet.
 */
export function ScreenplayToolbar({
  currentElement,
  onSetElement,
}: ScreenplayToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.toolbar}>
      <div
        className={styles.elementStrip}
        role="toolbar"
        aria-label={t("screenplay.toolbar.convertBlockAria")}
      >
        {ELEMENT_ORDER.map((el) => {
          const label = t(ELEMENT_LABEL_KEY[el]);
          return (
            <button
              key={el}
              type="button"
              className={`${styles.elementPill} ${currentElement === el ? styles.elementPillActive : ""}`}
              title={`${label} (${ELEMENT_SHORTCUTS[el]})`}
              aria-pressed={currentElement === el}
              onClick={() => onSetElement(el)}
              data-element={el}
            >
              <span className={styles.elementIcon} aria-hidden="true">
                {ELEMENT_ICONS[el]}
              </span>
              <span className={styles.elementLabel}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
