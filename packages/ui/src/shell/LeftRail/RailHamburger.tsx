// packages/ui/src/shell/LeftRail/RailHamburger.tsx
/**
 * Notion-style hamburger button anchored to the top-left corner.
 *
 * Visible only while `body[data-shell="collapsed"]` is set; hidden in `full`
 * (rail already open) and `focus` (chrome hidden). Clicking it toggles the
 * rail overlay; hovering it opens the overlay so the user can slide the
 * pointer into the rail panel without clicking.
 *
 * Press and hover go through react-aria (`useButton` + `useHover`) so
 * touch, keyboard, and screen-reader semantics are handled correctly.
 */
import { useRef } from "react";
import { useButton, useHover } from "react-aria";
import styles from "./RailHamburger.module.css";

export interface RailHamburgerProps {
  /** Fires when the user activates the hamburger (click / keyboard). */
  onPress: () => void;
  /** Fires when the pointer enters the button — caller opens the overlay. */
  onHoverStart?: () => void;
  /** Fires when the pointer leaves the button — caller schedules a close. */
  onHoverEnd?: () => void;
  /** Reflects the current overlay state for screen readers + visual styling. */
  isOverlayOpen: boolean;
  /** Optional aria-label override (Italian copy by default). */
  ariaLabel?: string;
}

export function RailHamburger({
  onPress,
  onHoverStart,
  onHoverEnd,
  isOverlayOpen,
  ariaLabel,
}: RailHamburgerProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const label =
    ariaLabel ?? (isOverlayOpen ? "Fissa sidebar (⌘\\)" : "Apri sidebar");
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": label,
      "aria-expanded": isOverlayOpen,
    },
    ref,
  );
  const { hoverProps } = useHover({
    onHoverStart: onHoverStart ? () => onHoverStart() : undefined,
    onHoverEnd: onHoverEnd ? () => onHoverEnd() : undefined,
  });

  return (
    <button
      ref={ref}
      {...buttonProps}
      {...hoverProps}
      className={styles.hamburger}
      data-testid="rail-hamburger"
      title={label}
    >
      <span aria-hidden="true" className={styles.glyph}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </span>
    </button>
  );
}
