import { useLayoutEffect, type RefObject } from "react";

/**
 * Tracks a textarea's own scrollHeight and pins an explicit block-size on
 * every value change, so the element grows to fit its content instead of
 * scrolling internally at a fixed height. Pair with `rows={1}` and a CSS
 * `max-block-size` cap on the caller's side (`overflow: hidden` on the
 * textarea, `resize: none`) — this hook only owns the measurement.
 */
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.blockSize = "auto";
    el.style.blockSize = `${el.scrollHeight}px`;
  }, [ref, value]);
}
