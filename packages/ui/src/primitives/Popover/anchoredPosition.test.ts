import { describe, it, expect } from "vitest";
import { computeAnchoredPosition, type AnchorRect } from "./anchoredPosition";

const rect = (r: Partial<AnchorRect>): AnchorRect => ({
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  ...r,
});

const VIEWPORT = { width: 1440, height: 900 };

describe("computeAnchoredPosition", () => {
  it("bottom-start anchors the left edge to the trigger left", () => {
    const { left, top } = computeAnchoredPosition({
      trigger: rect({
        left: 200,
        right: 280,
        top: 40,
        bottom: 60,
        width: 80,
        height: 20,
      }),
      overlay: { width: 480, height: 196 },
      viewport: VIEWPORT,
      placement: "bottom-start",
    });
    expect(left).toBe(200);
    expect(top).toBe(64); // bottom(60) + offset(4)
  });

  it("bottom-end anchors the right edge to the trigger right", () => {
    const { left } = computeAnchoredPosition({
      trigger: rect({ left: 800, right: 880, width: 80 }),
      overlay: { width: 320, height: 100 },
      viewport: VIEWPORT,
      placement: "bottom-end",
    });
    expect(left).toBe(560); // 880 - 320
  });

  it("bottom-center centres the overlay on the trigger", () => {
    const { left } = computeAnchoredPosition({
      trigger: rect({ left: 700, right: 740, width: 40 }),
      overlay: { width: 240, height: 100 },
      viewport: VIEWPORT,
      placement: "bottom-center",
    });
    expect(left).toBe(600); // 700 + 20 - 120
  });

  it("clamps to the right edge so a wide popover never overflows (N-16)", () => {
    // Trigger centred in a narrow 768 viewport; a 480px bottom-start popover
    // would extend to 348+480=828 > 768 without clamping.
    const { left } = computeAnchoredPosition({
      trigger: rect({ left: 348, right: 420, width: 72 }),
      overlay: { width: 480, height: 196 },
      viewport: { width: 768, height: 900 },
      placement: "bottom-start",
      margin: 8,
    });
    expect(left).toBe(768 - 480 - 8); // 280
    expect(left + 480).toBeLessThanOrEqual(768 - 8);
  });

  it("clamps to the left margin when never fully fits", () => {
    const { left } = computeAnchoredPosition({
      trigger: rect({ left: 10, right: 50, width: 40 }),
      overlay: { width: 400, height: 100 },
      viewport: { width: 390, height: 844 },
      placement: "bottom-start",
      margin: 8,
    });
    expect(left).toBe(8);
  });

  it("flips above the trigger when there is no room below", () => {
    const { top } = computeAnchoredPosition({
      trigger: rect({
        top: 820,
        bottom: 850,
        left: 100,
        right: 180,
        width: 80,
        height: 30,
      }),
      overlay: { width: 240, height: 300 },
      viewport: { width: 1440, height: 900 },
      placement: "bottom-start",
      offset: 4,
    });
    // 850 + 4 + 300 = 1154 > 892 → flip to 820 - 300 - 4 = 516
    expect(top).toBe(516);
  });

  it("pins to the top margin when it fits neither below nor above", () => {
    const { top } = computeAnchoredPosition({
      trigger: rect({ top: 30, bottom: 60, height: 30 }),
      overlay: { width: 200, height: 880 },
      viewport: { width: 1440, height: 900 },
      placement: "bottom-start",
    });
    expect(top).toBe(8); // flipped (30-880-4) < margin → margin
  });
});
