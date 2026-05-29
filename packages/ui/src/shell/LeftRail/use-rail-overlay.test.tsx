// packages/ui/src/shell/LeftRail/use-rail-overlay.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useRailOverlay } from "./use-rail-overlay";

afterEach(() => {
  cleanup();
  document.body.removeAttribute("data-rail-overlay");
});

describe("useRailOverlay", () => {
  it("starts closed regardless of shell state", () => {
    const { result } = renderHook(() => useRailOverlay({ shellState: "full" }));
    expect(result.current.isOpen).toBe(false);
    expect(document.body.hasAttribute("data-rail-overlay")).toBe(false);
  });

  it("ignores open() outside of collapsed mode", () => {
    const { result } = renderHook(() => useRailOverlay({ shellState: "full" }));
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(false);
    expect(document.body.hasAttribute("data-rail-overlay")).toBe(false);
  });

  it("opens the overlay in collapsed mode and sets the body attribute", () => {
    const { result } = renderHook(() =>
      useRailOverlay({ shellState: "collapsed" }),
    );
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    expect(document.body.getAttribute("data-rail-overlay")).toBe("open");
  });

  it("toggles open then closed", () => {
    const { result } = renderHook(() =>
      useRailOverlay({ shellState: "collapsed" }),
    );
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
    expect(document.body.hasAttribute("data-rail-overlay")).toBe(false);
  });

  it("close() works from any state", () => {
    const { result } = renderHook(() =>
      useRailOverlay({ shellState: "collapsed" }),
    );
    act(() => result.current.open());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it("auto-clears the overlay when leaving collapsed mode", () => {
    const { result, rerender } = renderHook(
      (props: { shellState: "full" | "collapsed" | "focus" }) =>
        useRailOverlay(props),
      { initialProps: { shellState: "collapsed" } },
    );
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    rerender({ shellState: "full" });
    expect(result.current.isOpen).toBe(false);
    expect(document.body.hasAttribute("data-rail-overlay")).toBe(false);
  });

  it("ignores toggle() in focus mode", () => {
    const { result } = renderHook(() =>
      useRailOverlay({ shellState: "focus" }),
    );
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });

  it("cleans up the body attribute on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useRailOverlay({ shellState: "collapsed" }),
    );
    act(() => result.current.open());
    expect(document.body.getAttribute("data-rail-overlay")).toBe("open");
    unmount();
    expect(document.body.hasAttribute("data-rail-overlay")).toBe(false);
  });
});
