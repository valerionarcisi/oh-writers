// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  SaveStateProvider,
  useSaveStateValue,
  useSaveStatePublisher,
} from "./save-state-context";

afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => (
  <SaveStateProvider>{children}</SaveStateProvider>
);

describe("save-state-context (Spec 63 P2/F3)", () => {
  it("is empty (hidden pill) by default", () => {
    const { result } = renderHook(() => useSaveStateValue(), { wrapper });
    expect(result.current.state).toBeUndefined();
    expect(result.current.onFlush).toBeUndefined();
  });

  it("a publisher sets state + secondsAgo + onFlush; the pill can call flush", () => {
    const flush = vi.fn();
    const { result } = renderHook(
      () => {
        useSaveStatePublisher("dirty", 3, flush);
        return useSaveStateValue();
      },
      { wrapper },
    );

    expect(result.current.state).toBe("dirty");
    expect(result.current.secondsAgo).toBe(3);
    expect(typeof result.current.onFlush).toBe("function");

    act(() => result.current.onFlush?.());
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("a fresh flush identity each render does NOT re-publish (no infinite loop)", () => {
    // Each render passes a brand-new closure. The published `onFlush` wrapper must
    // stay reference-stable (bridged through a ref) so the publish effect is not
    // re-fired by the changing identity.
    const { result, rerender } = renderHook(
      () => {
        useSaveStatePublisher("saving", undefined, () => {});
        return useSaveStateValue();
      },
      { wrapper },
    );

    const firstFlush = result.current.onFlush;
    rerender();
    expect(result.current.onFlush).toBe(firstFlush);
  });

  it("publishing undefined hides the pill again", () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: "saved" | undefined }) => {
        useSaveStatePublisher(state, undefined, state ? () => {} : undefined);
        return useSaveStateValue();
      },
      { wrapper, initialProps: { state: "saved" as "saved" | undefined } },
    );

    expect(result.current.state).toBe("saved");
    rerender({ state: undefined });
    expect(result.current.state).toBeUndefined();
    expect(result.current.onFlush).toBeUndefined();
  });
});
