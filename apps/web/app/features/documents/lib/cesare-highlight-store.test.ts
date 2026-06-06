// apps/web/app/features/documents/lib/cesare-highlight-store.test.ts
//
// Spec 63 — the per-document "Mostra cosa è cambiato" highlight store. Pins the
// contract the editor's decoration plugin reads: armed fragments per
// documentType, empty/whitespace filtered out, set/clear/notify cycle. Each test
// keys its own documentType to avoid cross-test bleed (module-level singleton).
import { describe, it, expect, vi } from "vitest";
import {
  setHighlight,
  clearHighlight,
  getHighlightFragments,
  subscribeHighlight,
} from "./cesare-highlight-store";

describe("cesare-highlight-store", () => {
  it("arms the fragments for a document type", () => {
    setHighlight("doc-arm", ["Roma", "macchie di sugo"]);
    expect(getHighlightFragments("doc-arm")).toEqual([
      "Roma",
      "macchie di sugo",
    ]);
  });

  it("filters out empty / whitespace-only fragments", () => {
    setHighlight("doc-filter", ["Roma", "  ", "", "Falerone"]);
    expect(getHighlightFragments("doc-filter")).toEqual(["Roma", "Falerone"]);
  });

  it("an all-empty set clears the document's highlight", () => {
    setHighlight("doc-empty", ["x"]);
    setHighlight("doc-empty", ["   ", ""]);
    expect(getHighlightFragments("doc-empty")).toEqual([]);
  });

  it("ignores an empty documentType", () => {
    setHighlight("", ["x"]);
    expect(getHighlightFragments("")).toEqual([]);
  });

  it("clearHighlight removes the document's fragments", () => {
    setHighlight("doc-clear", ["a"]);
    clearHighlight("doc-clear");
    expect(getHighlightFragments("doc-clear")).toEqual([]);
  });

  it("notifies subscribers on set and clear", () => {
    const listener = vi.fn();
    const unsub = subscribeHighlight(listener);
    setHighlight("doc-notify", ["a"]);
    clearHighlight("doc-notify");
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    setHighlight("doc-notify", ["b"]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
