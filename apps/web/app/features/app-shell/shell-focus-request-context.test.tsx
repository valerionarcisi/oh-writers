// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  ShellFocusRequestProvider,
  useShellFocusRequest,
} from "./shell-focus-request-context";

afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => (
  <ShellFocusRequestProvider>{children}</ShellFocusRequestProvider>
);

describe("shell-focus-request-context", () => {
  it("is not requested by default", () => {
    const { result } = renderHook(() => useShellFocusRequest(), { wrapper });
    expect(result.current.isFocusRequested).toBe(false);
  });

  it("requestFocus engages focus and releaseFocus disengages it", () => {
    const { result } = renderHook(() => useShellFocusRequest(), { wrapper });

    act(() => result.current.requestFocus());
    expect(result.current.isFocusRequested).toBe(true);

    act(() => result.current.releaseFocus());
    expect(result.current.isFocusRequested).toBe(false);
  });

  it("is reference-counted: focus holds until the last release", () => {
    const { result } = renderHook(() => useShellFocusRequest(), { wrapper });

    act(() => {
      result.current.requestFocus();
      result.current.requestFocus();
    });
    expect(result.current.isFocusRequested).toBe(true);

    // One release with two outstanding requests must NOT drop focus.
    act(() => result.current.releaseFocus());
    expect(result.current.isFocusRequested).toBe(true);

    act(() => result.current.releaseFocus());
    expect(result.current.isFocusRequested).toBe(false);
  });

  it("never underflows below zero (extra release is a no-op)", () => {
    const { result } = renderHook(() => useShellFocusRequest(), { wrapper });

    act(() => result.current.releaseFocus());
    expect(result.current.isFocusRequested).toBe(false);

    act(() => result.current.requestFocus());
    expect(result.current.isFocusRequested).toBe(true);
  });

  it("degrades to a stable no-op outside a provider", () => {
    const { result } = renderHook(() => useShellFocusRequest());
    expect(result.current.isFocusRequested).toBe(false);
    // Calling the no-ops must not throw.
    act(() => {
      result.current.requestFocus();
      result.current.releaseFocus();
    });
    expect(result.current.isFocusRequested).toBe(false);
  });
});
