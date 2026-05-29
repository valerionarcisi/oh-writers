// packages/ui/src/shell/LeftRail/RailHamburger.tsx
/**
 * Notion-style hamburger button anchored to the top-left corner.
 *
 * Visible only while `body[data-shell="collapsed"]` is set; hidden in `full`
 * (rail already open) and `focus` (chrome hidden). Clicking it toggles the
 * rail overlay by flipping `body[data-rail-overlay]`. The button position
 * never changes — same coordinates whether the rail is shown or hidden, so
 * the affordance is always reachable.
 *
 * Press behaviour goes through `react-aria`'s `useButton` so touch + keyboard
 * + screen-reader semantics match every other primitive in the shell.
 */
import { useRef } from "react";
import { useButton } from "react-aria";
import styles from "./RailHamburger.module.css";

export interface RailHamburgerProps {
  /** Fires when the user activates the hamburger. The caller decides whether
   *  to open the overlay, close it, or toggle. */
  onPress: () => void;
  /** Reflects the current overlay state for screen readers + visual styling. */
  isOverlayOpen: boolean;
  /** Optional aria-label override (Italian copy by default to match the
   *  rest of the shell). */
  ariaLabel?: string;
}

export function RailHamburger({
  onPress,
  isOverlayOpen,
  ariaLabel,
}: RailHamburgerProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const label =
    ariaLabel ?? (isOverlayOpen ? "Chiudi sidebar" : "Apri sidebar");
  const { buttonProps } = useButton(
    {
      onPress,
      "aria-label": label,
      "aria-expanded": isOverlayOpen,
    },
    ref,
  );

  return (
    <button
      ref={ref}
      {...buttonProps}
      className={styles.hamburger}
      data-testid="rail-hamburger"
      title={label}
    >
      <span aria-hidden="true" className={styles.glyph}>
        {/* Hamburger glyph (three horizontal bars). Kept as inline SVG so we
            don't need a sprite entry for a one-off icon. */}
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
