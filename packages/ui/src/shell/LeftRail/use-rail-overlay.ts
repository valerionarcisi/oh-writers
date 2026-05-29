// packages/ui/src/shell/LeftRail/use-rail-overlay.ts
/**
 * Notion-style overlay controller for the AppShell left rail.
 *
 * When `data-shell="collapsed"` is set on `<body>`, the rail is hidden by
 * default and a persistent hamburger button sits at the top-left corner.
 * Clicking the hamburger toggles `body[data-rail-overlay]` between `"open"`
 * and `"closed"`, which the rail CSS uses to slide the rail in/out as an
 * overlay on top of the editor (the editor never reflows).
 *
 * Unlike the previous hover-reveal pattern (now removed), there is no
 * mouseleave-based auto-close: the rail closes only when the user actively
 * dismisses it via the hamburger button, an outside click, or the ESC key.
 *
 * Public API:
 *
 *   ```tsx
 *   const { isOpen, open, close, toggle } = useRailOverlay({
 *     shellState,  // "full" | "collapsed" | "focus"
 *   });
 *   ```
 *
 * The hook is a no-op when `shellState !== "collapsed"`. When the user
 * leaves collapsed mode (e.g. presses `⌘\` to expand), any open overlay is
 * automatically cleared.
 *
 * Side effect: while the overlay is open, the hook sets
 * `body[data-rail-overlay="open"]`. The CSS uses this to slide the rail in.
 */

import { useCallback, useEffect, useState } from "react";

/** Shell states recognised by this hook. */
export type ShellState = "full" | "collapsed" | "focus";

export interface UseRailOverlayOptions {
  shellState: ShellState;
}

export interface UseRailOverlayResult {
  /** True when the rail overlay is currently visible. */
  isOpen: boolean;
  /** Open the overlay. No-op when shell is not "collapsed". */
  open: () => void;
  /** Close the overlay. */
  close: () => void;
  /** Toggle the overlay. No-op when shell is not "collapsed". */
  toggle: () => void;
}

/**
 * Notion-style rail overlay controller. See module docstring for usage.
 */
export function useRailOverlay(
  opts: UseRailOverlayOptions,
): UseRailOverlayResult {
  const { shellState } = opts;
  const isActive = shellState === "collapsed";

  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    if (!isActive) return;
    setIsOpen(true);
  }, [isActive]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (!isActive) return;
    setIsOpen((prev) => !prev);
  }, [isActive]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (isActive && isOpen) {
      body.setAttribute("data-rail-overlay", "open");
    } else {
      body.removeAttribute("data-rail-overlay");
    }
  }, [isActive, isOpen]);

  // Leaving collapsed (back to full or focus) auto-clears the overlay so
  // the rail does not stay in an inconsistent "open" state after the user
  // changes shell mode through some other path (⌘\ shortcut, focus toggle).
  useEffect(() => {
    if (!isActive && isOpen) {
      setIsOpen(false);
    }
  }, [isActive, isOpen]);

  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-rail-overlay");
      }
    };
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
