// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAutoSave, type SaveDocumentMutation } from "./useDocument";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Minimal mutation stand-in — `useAutoSave` only reads `isPending`/`isError`
// and calls `mutate`. The rest of UseMutationResult is irrelevant here.
const makeSave = () => {
  const mutate = vi.fn();
  const save = {
    mutate,
    isPending: false,
    isError: false,
  } as unknown as SaveDocumentMutation;
  return { save, mutate };
};

describe("useAutoSave (Spec 63 P2 + Spec 61)", () => {
  it("empty documentId is never dirty and never schedules a save", () => {
    vi.useFakeTimers();
    const { save, mutate } = makeSave();
    const { result } = renderHook(() =>
      // Logline pill before the sibling doc loads: id is "".
      useAutoSave(save, "", "edited content", "saved content"),
    );

    expect(result.current.isDirty).toBe(false);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("a pure re-serialisation is not dirty when normalize collapses it (no clobber)", () => {
    const { save } = makeSave();
    const normalize = (s: string) => s.replace(/<\/?p>/g, "").trim();
    const { result } = renderHook(() =>
      useAutoSave(save, "doc-1", "<p>Filippo</p>", "Filippo", normalize),
    );
    // Same text, differs only by <p> wrapping → not dirty.
    expect(result.current.isDirty).toBe(false);
  });

  it("a genuine content change IS dirty", () => {
    const { save } = makeSave();
    const { result } = renderHook(() =>
      useAutoSave(save, "doc-1", "new text", "old text"),
    );
    expect(result.current.isDirty).toBe(true);
  });
});
