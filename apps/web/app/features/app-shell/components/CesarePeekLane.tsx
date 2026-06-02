// apps/web/app/features/app-shell/components/CesarePeekLane.tsx
//
// The page-collapsing split lane (Spec 46 `?peek=`, Spec 47 task A4).
//
// When the host route carries `?peek=cesare`, the shell renders this lane as a
// REAL grid column to the right of `<main>`. The main lane keeps `min-inline-
// size: 0; flex: 1`, so the page reflows narrower instead of overflowing — the
// Notion side-peek model, NOT a floating overlay.
//
// The lane owns dismiss + focus management via react-aria (`useOverlay` +
// `useDialog`, mandatory — no hand-rolled ESC/focus). ESC clears `?peek`;
// browser-back clears it too (the param pops). Outside-click is intentionally
// NOT a dismiss trigger: unlike a modal, the page beside the lane stays the
// working surface, so clicking it must not close the column.
//
// The lane is pure layout + a11y plumbing. It hosts exactly ONE chat container
// — the SAME `CesareSheet` rendered in `surface="split"`, which brings its own
// Notion header (incl. the close `×`). The floating sheet is unmounted while
// the lane is open (AppShell decides), so the chat never duplicates.

import { useRef, type ReactNode } from "react";
import { useDialog, useOverlay, FocusScope } from "react-aria";
import { useTranslation } from "~/features/i18n";
import styles from "./CesarePeekLane.module.css";

export interface CesarePeekLaneProps {
  /** Clears `?peek` — invoked on ESC (via react-aria `useOverlay`). */
  onClose: () => void;
  /** Accessible label for the lane landmark. Defaults to the localised
   *  "Cesare — column" landmark label. */
  ariaLabel?: string;
  /** The split chat container (a `CesareSheet` with `surface="split"`). */
  children: ReactNode;
}

export function CesarePeekLane({
  onClose,
  ariaLabel,
  children,
}: CesarePeekLaneProps) {
  const { t } = useTranslation();
  const resolvedAriaLabel = ariaLabel ?? t("shell.peekLane.aria");
  const ref = useRef<HTMLDivElement>(null);

  // `useOverlay` provides ESC-to-close (mandatory react-aria dismiss). Outside-
  // interaction dismiss is disabled so the side-by-side page stays clickable.
  const { overlayProps } = useOverlay(
    {
      onClose,
      isOpen: true,
      isDismissable: true,
      shouldCloseOnInteractOutside: () => false,
    },
    ref,
  );

  const { dialogProps } = useDialog({ "aria-label": resolvedAriaLabel }, ref);

  return (
    <FocusScope>
      <aside
        {...overlayProps}
        {...dialogProps}
        ref={ref}
        className={styles.lane}
        data-testid="cesare-peek-lane"
        data-split-lane="cesare"
      >
        {children}
      </aside>
    </FocusScope>
  );
}
