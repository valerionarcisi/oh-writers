// apps/web/app/features/app-shell/components/CesarePeekLane.tsx
//
// The page-collapsing split lane (Spec 46 `?peek=`, Spec 47 task A4).
//
// When the host route carries `?peek=cesare`, the shell renders this lane as a
// REAL grid column to the right of `<main>`. The main lane keeps `min-inline-
// size: 0; flex: 1`, so the page reflows narrower instead of overflowing — the
// Notion side-peek model, NOT a floating overlay.
//
// ESC closes the lane (native onKeyDown on the aside). Outside-click is
// intentionally NOT a dismiss trigger: unlike a modal, the page beside the lane
// stays the working surface, so clicking it must not close the column.
//
// useOverlay is intentionally NOT used here. The lane is a persistent in-flow
// column, not a floating overlay. useOverlay installs a global useInteractOutside
// listener that treats portaled overlays (e.g. the logline Popover) as
// "outside" the lane and calls stopPropagation on their mousedown events,
// preventing focus from reaching inputs inside those portals.
//
// The lane is pure layout + a11y plumbing. It hosts exactly ONE chat container
// — the SAME `CesareSheet` rendered in `surface="split"`, which brings its own
// Notion header (incl. the close `×`). The floating sheet is unmounted while
// the lane is open (AppShell decides), so the chat never duplicates.

import { useRef, type ReactNode } from "react";
import { useDialog } from "react-aria";
import { useTranslation } from "~/features/i18n";
import styles from "./CesarePeekLane.module.css";

export interface CesarePeekLaneProps {
  /** Clears `?peek` — invoked on ESC. */
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

  const { dialogProps } = useDialog({ "aria-label": resolvedAriaLabel }, ref);

  return (
    <aside
      {...dialogProps}
      ref={ref}
      className={styles.lane}
      data-testid="cesare-peek-lane"
      data-split-lane="cesare"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {children}
    </aside>
  );
}
