// packages/ui/src/composites/CesareDrawer/use-drawer-resize.ts
/**
 * Drag-to-resize hook for the Cesare Drawer.
 *
 * Two flavours:
 *   - `axis: "block"` — drag handle on the TOP edge of the drawer (used in
 *     state `expanded`). Bigger drag distance = taller drawer.
 *   - `axis: "inline"` — drag handle on the LEFT edge of the drawer (used in
 *     state `expanded-split`). Bigger drag distance = wider drawer.
 *
 * Both flavours clamp to [min, max] bounds expressed either as `px` or as
 * viewport-percentage strings (`"76vh"`, `"60vw"`).
 *
 * Size persistence is the caller's responsibility — pass `initialSize` to
 * restore from localStorage and pass `onSizeChange` to persist while the
 * user drags. The hook itself stores nothing.
 *
 * Built on `react-aria`'s `useMove` so we get pointer + touch + keyboard
 * arrow-step support out of the box.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMove } from "react-aria";
import type { MoveResult } from "react-aria";

export type ResizeAxis = "block" | "inline";

export interface UseDrawerResizeOptions {
  axis: ResizeAxis;
  /** Initial size in CSS px. The hook always returns the current size in px. */
  initialSize: number;
  /** Min size in CSS px. Default 320. */
  min?: number;
  /**
   * Max size — either an absolute px number or a viewport-relative string
   * like `"76vh"` / `"60vw"`. Resolved on every drag tick so window resizes
   * are picked up live.
   */
  max?: number | `${number}vh` | `${number}vw`;
  /** Fires every drag tick with the clamped size in px. */
  onSizeChange?: (sizePx: number) => void;
  /** Optional disable switch (e.g. user is in `prefers-reduced-motion`). */
  isDisabled?: boolean;
}

type DrawerHandleProps = MoveResult["moveProps"] & {
  role: "separator";
  tabIndex: number;
  "aria-orientation": "horizontal" | "vertical";
  "aria-label": string;
  "aria-valuenow": number;
  "aria-valuemin": number;
  "aria-valuemax": number;
};

export interface UseDrawerResizeResult {
  /** Spread on the drag-handle element (`<div>` or `<button>`). */
  handleProps: DrawerHandleProps;
  /** Current size in CSS px. Apply as inline-block-size or inline-size. */
  size: number;
  /** True while the user is actively dragging. Useful to disable transitions. */
  isResizing: boolean;
}

/**
 * SSR-stable max: never reads `window`, so the server and the first client
 * render agree. A numeric `max` is exact; a viewport-relative `max` resolves to
 * the placeholder until the mount effect swaps in the real px. Keeping this
 * deterministic is what removes the `aria-valuemax` hydration mismatch.
 */
function resolveMaxSsr(max: number | string | undefined): number {
  return typeof max === "number" ? max : 9999;
}

function resolveMax(
  max: number | string | undefined,
  axis: ResizeAxis,
): number {
  if (typeof max === "number") return max;
  if (typeof window === "undefined") return 9999;
  if (!max) {
    // Sensible defaults: block axis → 76vh, inline axis → 60vw.
    return axis === "block"
      ? Math.round(window.innerHeight * 0.76)
      : Math.round(window.innerWidth * 0.6);
  }
  const m = /^(\d+(?:\.\d+)?)v([hw])$/.exec(max);
  if (!m) return 9999;
  const value = Number(m[1]);
  const unit = m[2];
  const base = unit === "h" ? window.innerHeight : window.innerWidth;
  return Math.round((value / 100) * base);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Drag-resize the drawer along one axis.
 *
 * @example
 * ```tsx
 * const { handleProps, size, isResizing } = useDrawerResize({
 *   axis: "block",
 *   initialSize: 480,
 *   min: 320,
 *   max: "76vh",
 *   onSizeChange: (px) => localStorage.setItem("ohw.drawer.size.expanded", String(px)),
 * });
 * return (
 *   <aside style={{ blockSize: size }}>
 *     <div className={styles.handleTop} {...handleProps} />
 *     {...}
 *   </aside>
 * );
 * ```
 */
export function useDrawerResize(
  options: UseDrawerResizeOptions,
): UseDrawerResizeResult {
  const {
    axis,
    initialSize,
    min = 320,
    max,
    onSizeChange,
    isDisabled = false,
  } = options;

  // `maxPx` is held in state and initialised to the SSR-stable value so the
  // first client render matches the server-rendered HTML exactly (no hydration
  // mismatch on `aria-valuemax`). The real viewport-derived max is resolved in a
  // mount effect, AFTER hydration, when reading `window` is safe and any change
  // no longer triggers React's "attributes didn't match" warning.
  const [maxPx, setMaxPx] = useState<number>(() => resolveMaxSsr(max));

  const [size, setSize] = useState<number>(() =>
    clamp(initialSize, min, resolveMaxSsr(max)),
  );
  const [isResizing, setIsResizing] = useState(false);
  // `dragStartSizeRef` keeps the size at drag-start so each move event
  // computes a delta from the same anchor, regardless of intermediate state.
  const dragStartSizeRef = useRef<number>(size);
  const lastSizeRef = useRef<number>(size);

  // Keep refs in sync with the latest state for handlers that fire async.
  useEffect(() => {
    lastSizeRef.current = size;
  }, [size]);

  // Resolve the real max + clamp the size on mount and on every viewport
  // resize. Runs only on the client (post-hydration), so the SSR/first-render
  // `aria-valuemax` stays stable and the value updates without a mismatch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const next = resolveMax(max, axis);
      setMaxPx(next);
      setSize((current) => clamp(current, min, next));
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [axis, max, min]);

  const handleStart = useCallback(() => {
    if (isDisabled) return;
    setIsResizing(true);
    dragStartSizeRef.current = lastSizeRef.current;
  }, [isDisabled]);

  const handleEnd = useCallback(() => {
    if (isDisabled) return;
    setIsResizing(false);
  }, [isDisabled]);

  const handleMove = useCallback(
    (e: { deltaX: number; deltaY: number }) => {
      if (isDisabled) return;
      // For block-axis (top edge), dragging UP (negative deltaY) makes drawer
      // grow downward — i.e. dragging up should INCREASE the height because
      // the drawer is anchored to the bottom-right. Hence subtract deltaY.
      // For inline-axis (left edge), dragging LEFT (negative deltaX) makes
      // the drawer grow rightward — subtract deltaX.
      const delta = axis === "block" ? -e.deltaY : -e.deltaX;
      const next = clamp(lastSizeRef.current + delta, min, maxPx);
      lastSizeRef.current = next;
      setSize(next);
      onSizeChange?.(next);
    },
    [axis, isDisabled, maxPx, min, onSizeChange],
  );

  const { moveProps } = useMove({
    onMoveStart: handleStart,
    onMove: handleMove,
    onMoveEnd: handleEnd,
  });

  // Compose the move props with semantic ARIA + cursor styling so the handle
  // is discoverable to assistive tech and the keyboard.
  const handleProps = useMemo<DrawerHandleProps>(() => {
    return {
      ...moveProps,
      role: "separator",
      tabIndex: isDisabled ? -1 : 0,
      "aria-orientation": axis === "block" ? "horizontal" : "vertical",
      "aria-label":
        axis === "block"
          ? "Ridimensiona altezza drawer"
          : "Ridimensiona larghezza drawer",
      "aria-valuenow": size,
      "aria-valuemin": min,
      "aria-valuemax": maxPx,
    };
  }, [moveProps, axis, isDisabled, maxPx, min, size]);

  return { handleProps, size, isResizing };
}

/**
 * Helper: read a persisted size from localStorage. Returns `fallback` when
 * the value is missing or unparseable. SSR-safe.
 */
export function readPersistedSize(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

/** Storage keys are part of the public API; centralized so callers stay aligned. */
export const DRAWER_SIZE_STORAGE_KEYS = {
  expanded: "ohw.drawer.size.expanded",
  split: "ohw.drawer.size.split",
} as const;
