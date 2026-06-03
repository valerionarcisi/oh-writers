// Pure placement math for the Popover primitive. Kept DOM-free so it can be
// unit-tested in isolation and reused by any anchored overlay. Given the
// trigger rect, the measured overlay size, and the viewport, it returns the
// fixed-position {top,left} that keeps the overlay on screen — clamping
// horizontally and flipping above the trigger when there is no room below.

export type AnchoredPlacement = "bottom-start" | "bottom-end" | "bottom-center";

export interface AnchorRect {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface AnchoredPositionArgs {
  readonly trigger: AnchorRect;
  readonly overlay: Pick<AnchorRect, "width" | "height">;
  readonly viewport: ViewportSize;
  readonly placement: AnchoredPlacement;
  /** Padding kept between the overlay and the viewport edge. */
  readonly margin?: number;
  /** Gap between the trigger and the overlay. */
  readonly offset?: number;
}

export interface AnchoredPosition {
  readonly top: number;
  readonly left: number;
}

export function computeAnchoredPosition({
  trigger,
  overlay,
  viewport,
  placement,
  margin = 8,
  offset = 4,
}: AnchoredPositionArgs): AnchoredPosition {
  const anchoredLeft =
    placement === "bottom-end"
      ? trigger.right - overlay.width
      : placement === "bottom-center"
        ? trigger.left + trigger.width / 2 - overlay.width / 2
        : trigger.left;

  // Clamp into the viewport. When the overlay is wider than the available
  // space, `maxLeft` falls below `margin`; `max(margin, …)` then pins it to
  // the left margin so it overflows the right edge rather than disappearing.
  const maxLeft = viewport.width - overlay.width - margin;
  const left = Math.max(margin, Math.min(anchoredLeft, maxLeft));

  let top = trigger.bottom + offset;
  const overflowsBottom = top + overlay.height > viewport.height - margin;
  if (overflowsBottom) {
    const flipped = trigger.top - overlay.height - offset;
    top = flipped >= margin ? flipped : margin;
  }

  return { top, left };
}
