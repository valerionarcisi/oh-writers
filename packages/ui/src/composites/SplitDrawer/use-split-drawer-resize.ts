// packages/ui/src/composites/SplitDrawer/use-split-drawer-resize.ts
/**
 * Drag-to-resize hook for the SplitDrawer primitive. Uses the LEFT edge as
 * the drag handle so the right-anchored panel grows toward the page when
 * dragged left. Mirrors the inline-axis flavour of {@link useDrawerResize}
 * but specialised to the SplitDrawer's bounds (min 360, default max 60vw).
 *
 * Built on `react-aria`'s `useMove` so we get pointer + touch + keyboard
 * arrow-step support out of the box.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMove } from "react-aria";
import type { MoveResult } from "react-aria";

export interface UseSplitDrawerResizeOptions {
  /** Initial size in CSS px. The hook always returns the current size in px. */
  initialSize: number;
  /** Min size in CSS px. Default 360. */
  min?: number;
  /**
   * Max size — either an absolute px number or a viewport-relative string
   * like `"60vw"`. Resolved on every drag tick so window resizes are picked
   * up live. Default `"60vw"`.
   */
  max?: number | `${number}vw`;
  /** Fires every drag tick with the clamped size in px. */
  onSizeChange?: (sizePx: number) => void;
  /** Optional disable switch (e.g. user is in `prefers-reduced-motion`). */
  isDisabled?: boolean;
}

type SplitDrawerHandleProps = MoveResult["moveProps"] & {
  role: "separator";
  tabIndex: number;
  "aria-orientation": "vertical";
  "aria-label": string;
  "aria-valuenow": number;
  "aria-valuemin": number;
  "aria-valuemax": number;
};

export interface UseSplitDrawerResizeResult {
  /** Spread on the drag-handle element (`<div>` or `<button>`). */
  handleProps: SplitDrawerHandleProps;
  /** Current size in CSS px. Apply as inline-size. */
  size: number;
  /** True while the user is actively dragging. Useful to disable transitions. */
  isResizing: boolean;
}

function resolveMax(max: number | string | undefined): number {
  if (typeof max === "number") return max;
  if (typeof window === "undefined") return 9999;
  if (!max) return Math.round(window.innerWidth * 0.6);
  const m = /^(\d+(?:\.\d+)?)vw$/.exec(max);
  if (!m) return 9999;
  const value = Number(m[1]);
  return Math.round((value / 100) * window.innerWidth);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Drag-resize the SplitDrawer along its left edge.
 *
 * @example
 * ```tsx
 * const { handleProps, size, isResizing } = useSplitDrawerResize({
 *   initialSize: 480,
 *   min: 360,
 *   max: "60vw",
 *   onSizeChange: (px) => localStorage.setItem("ohw.split-drawer.width", String(px)),
 * });
 * return (
 *   <aside style={{ inlineSize: size }}>
 *     <div className={styles.handleLeft} {...handleProps} />
 *     {...}
 *   </aside>
 * );
 * ```
 */
export function useSplitDrawerResize(
  options: UseSplitDrawerResizeOptions,
): UseSplitDrawerResizeResult {
  const {
    initialSize,
    min = 360,
    max,
    onSizeChange,
    isDisabled = false,
  } = options;

  const [size, setSize] = useState<number>(() => {
    const maxPx = resolveMax(max);
    return clamp(initialSize, min, maxPx);
  });
  const [isResizing, setIsResizing] = useState(false);
  const dragStartSizeRef = useRef<number>(size);
  const lastSizeRef = useRef<number>(size);

  useEffect(() => {
    lastSizeRef.current = size;
  }, [size]);

  // Clamp when the viewport shrinks so the drawer never overflows.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const maxPx = resolveMax(max);
      setSize((current) => clamp(current, min, maxPx));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [max, min]);

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
      const maxPx = resolveMax(max);
      // Right-anchored: dragging the left edge LEFT (negative deltaX)
      // grows the drawer rightward. We negate deltaX so leftward drag
      // increases the width.
      const next = clamp(lastSizeRef.current - e.deltaX, min, maxPx);
      lastSizeRef.current = next;
      setSize(next);
      onSizeChange?.(next);
    },
    [isDisabled, max, min, onSizeChange],
  );

  const { moveProps } = useMove({
    onMoveStart: handleStart,
    onMove: handleMove,
    onMoveEnd: handleEnd,
  });

  const handleProps = useMemo<SplitDrawerHandleProps>(() => {
    return {
      ...moveProps,
      role: "separator",
      tabIndex: isDisabled ? -1 : 0,
      "aria-orientation": "vertical",
      "aria-label": "Ridimensiona larghezza pannello",
      "aria-valuenow": size,
      "aria-valuemin": min,
      "aria-valuemax": resolveMax(max),
    };
  }, [moveProps, isDisabled, max, min, size]);

  return { handleProps, size, isResizing };
}

/**
 * Helper: read a persisted size from localStorage. Returns `fallback` when
 * the value is missing or unparseable. SSR-safe.
 */
export function readPersistedSplitSize(key: string, fallback: number): number {
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
export const SPLIT_DRAWER_STORAGE_KEYS = {
  width: "ohw.split-drawer.width",
} as const;
