import { useEffect, useRef, type RefObject } from "react";

const EDGE_THRESHOLD_PX = 80;
const MAX_SCROLL_SPEED_PX = 18;
const TICK_MS = 16;

/**
 * When the user drags near the left or right edge of the container, the
 * container auto-scrolls horizontally so off-screen drop targets become
 * reachable. The speed ramps with how close the cursor is to the edge.
 *
 * Activation is gated on `enabled`: callers pass the boolean "is dragging"
 * state so we only attach listeners during an active drag.
 */
export function useDragAutoScroll(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  const rafRef = useRef<number | null>(null);
  const velocityRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const tick = () => {
      if (Math.abs(velocityRef.current) > 0.5) {
        el.scrollLeft += velocityRef.current;
        rafRef.current = window.setTimeout(tick, TICK_MS);
      } else {
        rafRef.current = null;
      }
    };

    const ensureTicking = () => {
      if (rafRef.current === null) tick();
    };

    const onDragOver = (e: DragEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX;
      const distLeft = x - rect.left;
      const distRight = rect.right - x;

      if (distLeft < EDGE_THRESHOLD_PX) {
        const ratio = Math.max(0, 1 - distLeft / EDGE_THRESHOLD_PX);
        velocityRef.current = -MAX_SCROLL_SPEED_PX * ratio;
        ensureTicking();
      } else if (distRight < EDGE_THRESHOLD_PX) {
        const ratio = Math.max(0, 1 - distRight / EDGE_THRESHOLD_PX);
        velocityRef.current = MAX_SCROLL_SPEED_PX * ratio;
        ensureTicking();
      } else {
        velocityRef.current = 0;
      }
    };

    const stop = () => {
      velocityRef.current = 0;
      if (rafRef.current !== null) {
        window.clearTimeout(rafRef.current);
        rafRef.current = null;
      }
    };

    el.addEventListener("dragover", onDragOver);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);

    return () => {
      el.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
      stop();
    };
  }, [containerRef, enabled]);
}
