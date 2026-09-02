// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCookieBannerDismissed } from "./use-cookie-banner-dismissed";

// ponytail: Node 25 + jsdom leaves window.localStorage as a bare object with
// no Storage methods in this test env (a known Node 25 gotcha, see
// project memory on Node 25 quirks) — stub it in-memory rather than fight
// the environment for one hook's test.
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(stubLocalStorage);

describe("useCookieBannerDismissed", () => {
  it("is not dismissed by default", () => {
    const { result } = renderHook(() => useCookieBannerDismissed());
    expect(result.current[0]).toBe(false);
  });

  it("becomes dismissed after calling dismiss()", () => {
    const { result } = renderHook(() => useCookieBannerDismissed());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });

  it("stays dismissed across remounts (persisted)", () => {
    const first = renderHook(() => useCookieBannerDismissed());
    act(() => first.result.current[1]());
    first.unmount();

    const second = renderHook(() => useCookieBannerDismissed());
    expect(second.result.current[0]).toBe(true);
  });
});
