// packages/ui/src/shell/LeftRail/use-rail-overlay.ts
/**
 * Notion-style overlay controller for the AppShell left rail.
 *
 * When `data-shell="collapsed"` is set on `<body>`, the rail is hidden by
 * default and a persistent hamburger button sits at the top-left corner.
 * Hovering the hamburger slides the full rail in as an overlay on top of the
 * editor (the editor never reflows), exactly like Notion's collapsed sidebar.
 * Moving the mouse into the popover keeps it open; leaving it (without locking
 * the sidebar) slides it back out after a short grace delay so travelling
 * between the hamburger and the popover never flickers.
 *
 * The overlay sets `body[data-rail-overlay="open"]`, which the rail CSS uses to
 * translate the rail into view. It is purely a peek: the editor keeps its
 * layout width. To pin the rail permanently the user presses the in-popover
 * "Lock sidebar open" button, which flips the shell back to `full` (owned by
 * the caller).
 *
 * Public API:
 *
 *   ```tsx
 *   const overlay = useRailOverlay({ shellState }); // "full" | "collapsed" | "focus"
 *   // overlay.open() / close() / toggle()      — immediate state changes
 *   // overlay.scheduleClose()                  — delayed close (anti-flicker)
 *   // overlay.cancelScheduledClose()           — keep the peek open on re-enter
 *   ```
 *
 * The hover/open/toggle entrypoints are no-ops when `shellState !== "collapsed"`.
 * Leaving collapsed mode (e.g. `⌘\` to expand) clears any open overlay and
 * cancels any pending close.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Shell states recognised by this hook. */
export type ShellState = "full" | "collapsed" | "focus";

/** Grace period before a hover-out closes the peek. Keeps the popover open
 *  while the pointer travels between the hamburger and the rail so the two
 *  hit-targets feel like one surface. */
const CLOSE_DELAY_MS = 180;

export interface UseRailOverlayOptions {
  shellState: ShellState;
  /** Override the anti-flicker close delay (ms). Tests pass a tiny value. */
  closeDelayMs?: number;
}

export interface UseRailOverlayResult {
  /** True when the rail overlay is currently visible. */
  isOpen: boolean;
  /** Open the overlay immediately. No-op when shell is not "collapsed". */
  open: () => void;
  /** Close the overlay immediately and cancel any pending delayed close. */
  close: () => void;
  /** Toggle the overlay. No-op when shell is not "collapsed". */
  toggle: () => void;
  /** Schedule a close after the grace delay. Cancellable via
   *  `cancelScheduledClose`. No-op when shell is not "collapsed". */
  scheduleClose: () => void;
  /** Cancel a pending delayed close (e.g. pointer re-entered the surface). */
  cancelScheduledClose: () => void;
}

/**
 * Notion-style rail overlay controller. See module docstring for usage.
 */
export function useRailOverlay(
  opts: UseRailOverlayOptions,
): UseRailOverlayResult {
  const { shellState, closeDelayMs = CLOSE_DELAY_MS } = opts;
  const isActive = shellState === "collapsed";

  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const open = useCallback(() => {
    if (!isActive) return;
    clearCloseTimer();
    setIsOpen(true);
  }, [isActive, clearCloseTimer]);

  const close = useCallback(() => {
    clearCloseTimer();
    setIsOpen(false);
  }, [clearCloseTimer]);

  const toggle = useCallback(() => {
    if (!isActive) return;
    clearCloseTimer();
    setIsOpen((prev) => !prev);
  }, [isActive, clearCloseTimer]);

  const cancelScheduledClose = useCallback(() => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    if (!isActive) return;
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setIsOpen(false);
    }, closeDelayMs);
  }, [isActive, clearCloseTimer, closeDelayMs]);

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
      clearCloseTimer();
      setIsOpen(false);
    }
  }, [isActive, isOpen, clearCloseTimer]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-rail-overlay");
      }
    };
  }, [clearCloseTimer]);

  return {
    isOpen,
    open,
    close,
    toggle,
    scheduleClose,
    cancelScheduledClose,
  };
}
