// packages/ui/src/shell/LeftRail/use-rail-reveal.ts
/**
 * Notion-style hover-reveal for the AppShell left rail.
 *
 * When `data-shell="collapsed"` is set on `<body>`, the rail is hidden by
 * default. A 4px-wide invisible sentinel at the left viewport edge captures
 * pointer events: hovering it opens the rail as a TEMPORARY OVERLAY (not as
 * a grid column — the editor never reflows).
 *
 * The rail closes again when:
 *   - The pointer leaves both the sentinel and the rail; AND
 *   - 300ms have elapsed without re-entering. The grace window lets users
 *     traverse the small gap between sentinel and rail without flicker.
 *
 * Touch / keyboard equivalents are out of scope for this hook — the shell
 * agent (WP-A) provides:
 *   - A hamburger button (always visible top-left in `collapsed`, hidden in
 *     `focus`) that calls `onLockOpen()` or toggles the reveal manually.
 *   - The `⌘\` shortcut that returns the shell to `full`.
 *
 * Public API:
 *
 *   ```tsx
 *   const { sentinelProps, railProps, isRevealed, lockOpenProps } = useRailReveal({
 *     shellState,        // "full" | "collapsed" | "focus"
 *     onLockOpen: () => setShellState("full"),
 *   });
 *
 *   return (
 *     <>
 *       <div {...sentinelProps} />
 *       <aside {...railProps}>
 *         <button {...lockOpenProps}>»</button>
 *         ...
 *       </aside>
 *     </>
 *   );
 *   ```
 *
 * `sentinelProps` go on a `<div>` positioned `position: fixed; inset-inline-start: 0;
 * inset-block: 0; inline-size: 4px;` — styles are the caller's responsibility,
 * the hook only attaches event listeners.
 *
 * `railProps` go on the rail wrapper. They wire mouseenter/mouseleave so the
 * grace timer is cancelled while the pointer is inside the rail or any of
 * its descendants (menus, popovers).
 *
 * Side effect: when the rail is revealed, the hook sets
 * `body[data-rail-reveal="open"]`. The CSS uses this to slide the rail in.
 * When `shellState !== "collapsed"`, the hook is a no-op (no listeners
 * attached, no data attribute set).
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Shell states recognised by this hook. The hook only acts on "collapsed". */
export type ShellState = "full" | "collapsed" | "focus";

export interface UseRailRevealOptions {
  shellState: ShellState;
  /** Called when the user clicks the `»` lock chip in the revealed rail. */
  onLockOpen: () => void;
  /**
   * Grace period (ms) before the rail collapses after the pointer leaves.
   * Defaults to 300ms — long enough to traverse the sentinel↔rail gap
   * without flicker, short enough not to feel sticky.
   */
  graceMs?: number;
}

interface ElementProps {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

interface SentinelProps extends ElementProps {
  "data-rail-sentinel": "";
  "aria-hidden": "true";
}

interface RailProps extends ElementProps {
  "data-rail-reveal-target": "";
}

interface LockOpenProps {
  onClick: () => void;
  "aria-label": string;
  "data-rail-lock-open": "";
}

export interface UseRailRevealResult {
  /** Spread on the sentinel div positioned at the left viewport edge. */
  sentinelProps: SentinelProps;
  /** Spread on the rail wrapper. */
  railProps: RailProps;
  /** Spread on the "lock open" (`»`) button inside the revealed rail. */
  lockOpenProps: LockOpenProps;
  /** True when the rail is currently revealed. */
  isRevealed: boolean;
}

/**
 * Notion-style hover-reveal hook. See module docstring for usage.
 */
export function useRailReveal(opts: UseRailRevealOptions): UseRailRevealResult {
  const { shellState, onLockOpen, graceMs = 300 } = opts;
  const isActive = shellState === "collapsed";

  const [isRevealed, setIsRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    if (!isActive) return;
    clearTimer();
    setIsRevealed(true);
  }, [isActive, clearTimer]);

  const scheduleHide = useCallback(() => {
    if (!isActive) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsRevealed(false);
      timerRef.current = null;
    }, graceMs);
  }, [isActive, clearTimer, graceMs]);

  // ── Side effect: drive body[data-rail-reveal] so the CSS knows. ────
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (isActive && isRevealed) {
      body.setAttribute("data-rail-reveal", "open");
    } else {
      body.removeAttribute("data-rail-reveal");
    }
  }, [isActive, isRevealed]);

  // ── Auto-collapse when leaving the collapsed shell state. ──────────
  useEffect(() => {
    if (!isActive && isRevealed) {
      setIsRevealed(false);
      clearTimer();
    }
  }, [isActive, isRevealed, clearTimer]);

  // ── Cleanup on unmount. ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimer();
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-rail-reveal");
      }
    };
  }, [clearTimer]);

  const handleLockOpen = useCallback(() => {
    clearTimer();
    setIsRevealed(false);
    onLockOpen();
  }, [clearTimer, onLockOpen]);

  return {
    sentinelProps: {
      onMouseEnter: reveal,
      onMouseLeave: scheduleHide,
      "data-rail-sentinel": "",
      "aria-hidden": "true",
    },
    railProps: {
      onMouseEnter: reveal,
      onMouseLeave: scheduleHide,
      "data-rail-reveal-target": "",
    },
    lockOpenProps: {
      onClick: handleLockOpen,
      "aria-label": "Mantieni sidebar aperta",
      "data-rail-lock-open": "",
    },
    isRevealed,
  };
}
