// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  CesareSurfaceProvider,
  useCesareSurface,
} from "./cesare-surface-context";

afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => (
  <CesareSurfaceProvider>{children}</CesareSurfaceProvider>
);

describe("cesare-surface-context", () => {
  it("is inactive by default", () => {
    const { result } = renderHook(() => useCesareSurface(), { wrapper });
    expect(result.current.isCesareSurfaceActive).toBe(false);
  });

  it("registerSurface activates and unregisterSurface deactivates", () => {
    const { result } = renderHook(() => useCesareSurface(), { wrapper });

    act(() => result.current.registerSurface());
    expect(result.current.isCesareSurfaceActive).toBe(true);

    act(() => result.current.unregisterSurface());
    expect(result.current.isCesareSurfaceActive).toBe(false);
  });

  it("is reference-counted: stays active until the last unregister", () => {
    const { result } = renderHook(() => useCesareSurface(), { wrapper });

    act(() => {
      result.current.registerSurface();
      result.current.registerSurface();
    });
    expect(result.current.isCesareSurfaceActive).toBe(true);

    act(() => result.current.unregisterSurface());
    expect(result.current.isCesareSurfaceActive).toBe(true);

    act(() => result.current.unregisterSurface());
    expect(result.current.isCesareSurfaceActive).toBe(false);
  });

  it("never underflows below zero (extra unregister is a no-op)", () => {
    const { result } = renderHook(() => useCesareSurface(), { wrapper });

    act(() => result.current.unregisterSurface());
    expect(result.current.isCesareSurfaceActive).toBe(false);

    act(() => result.current.registerSurface());
    expect(result.current.isCesareSurfaceActive).toBe(true);
  });

  it("degrades to a stable no-op outside a provider", () => {
    const { result } = renderHook(() => useCesareSurface());
    expect(result.current.isCesareSurfaceActive).toBe(false);
    act(() => {
      result.current.registerSurface();
      result.current.unregisterSurface();
    });
    expect(result.current.isCesareSurfaceActive).toBe(false);
  });
});
