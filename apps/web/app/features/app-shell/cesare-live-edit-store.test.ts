// apps/web/app/features/app-shell/cesare-live-edit-store.test.ts
//
// Spec 78 §A2 — the per-document LATEST live Cesare edit. These pin the contract
// the entity-page notice relies on: AT MOST ONE entry per documentType (a new turn
// REPLACES the previous, never stacks), the pre-turn snapshot capture, and the
// publish/dismiss/clear notify cycle. Module-level state has no public reset, so
// each test keys its own documentType to avoid cross-test bleed.
import { describe, it, expect, vi } from "vitest";
import {
  publishLiveEdits,
  dismissLiveEdit,
  clearLiveEdits,
  getLiveEditsFor,
  reportCurrentVersion,
  subscribeLiveEdit,
  type PublishLiveEditInput,
} from "./cesare-live-edit-store";

const seg = (op: "eq" | "add" | "del", text: string) => ({ op, text });

const editOn = (
  documentType: string,
  overrides: Partial<PublishLiveEditInput> = {},
): PublishLiveEditInput => ({
  documentType,
  label: "Soggetto",
  segments: [seg("eq", "Un film su "), seg("add", "Roma")],
  summary: "Aggiunto un riferimento a Roma",
  previousVersionId: null,
  ...overrides,
});

describe("publishLiveEdits", () => {
  it("keeps only the LATEST edit per document — a new turn replaces, never stacks", () => {
    const doc = "no-stack";
    publishLiveEdits([editOn(doc, { summary: "first" })]);
    publishLiveEdits([editOn(doc, { summary: "second" })]);
    publishLiveEdits([editOn(doc, { summary: "third" })]);
    const stack = getLiveEditsFor(doc);
    // Spec 78 §A2: at most one notice per document — no pile across turns.
    expect(stack).toHaveLength(1);
    expect(stack[0]?.summary).toBe("third");
  });

  it("collapses multiple writes to the SAME document in one turn to the last", () => {
    const doc = "same-doc-one-turn";
    publishLiveEdits([
      editOn(doc, { summary: "early" }),
      editOn(doc, { summary: "late" }),
    ]);
    const stack = getLiveEditsFor(doc);
    expect(stack).toHaveLength(1);
    expect(stack[0]?.summary).toBe("late");
  });

  it("keeps independent latest entries for different documents", () => {
    publishLiveEdits([
      editOn("multi-a", { summary: "a" }),
      editOn("multi-b", { summary: "b" }),
    ]);
    expect(getLiveEditsFor("multi-a")).toHaveLength(1);
    expect(getLiveEditsFor("multi-b")).toHaveLength(1);
    expect(getLiveEditsFor("multi-a")[0]?.summary).toBe("a");
    expect(getLiveEditsFor("multi-b")[0]?.summary).toBe("b");
  });

  it("is a no-op for an empty batch and does not notify", () => {
    const listener = vi.fn();
    const unsub = subscribeLiveEdit(listener);
    publishLiveEdits([]);
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it("ignores entries with an empty documentType", () => {
    publishLiveEdits([editOn("")]);
    expect(getLiveEditsFor("")).toHaveLength(0);
  });

  it("notifies subscribers once per non-empty batch", () => {
    const listener = vi.fn();
    const unsub = subscribeLiveEdit(listener);
    publishLiveEdits([editOn("notify-doc")]);
    publishLiveEdits([editOn("notify-doc")]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
  });
});

describe("pre-turn snapshot (option A over B)", () => {
  it("pairs the edit with the version the editor reported BEFORE the turn", () => {
    const doc = "snapshot-a";
    reportCurrentVersion(doc, "v-before-turn");
    publishLiveEdits([editOn(doc, { previousVersionId: "marker-prev" })]);
    const [entry] = getLiveEditsFor(doc);
    // Option A: the open-editor snapshot wins over the marker's previous id (B).
    expect(entry?.previousVersionId).toBe("v-before-turn");
  });

  it("falls back to the marker's previous id when the editor never reported", () => {
    const doc = "snapshot-b";
    publishLiveEdits([editOn(doc, { previousVersionId: "marker-prev" })]);
    const [entry] = getLiveEditsFor(doc);
    expect(entry?.previousVersionId).toBe("marker-prev");
  });

  it("consumes the snapshot so the NEXT turn re-captures (no stale reuse)", () => {
    const doc = "snapshot-consume";
    reportCurrentVersion(doc, "v1");
    publishLiveEdits([editOn(doc, { previousVersionId: "marker-1" })]);
    // First turn used the reported snapshot v1.
    expect(getLiveEditsFor(doc)[0]?.previousVersionId).toBe("v1");
    // No new report → the second turn must fall back to its own marker, not v1.
    // The new turn also REPLACES the first (no stacking).
    publishLiveEdits([editOn(doc, { previousVersionId: "marker-2" })]);
    const stack = getLiveEditsFor(doc);
    expect(stack).toHaveLength(1);
    expect(stack[0]?.previousVersionId).toBe("marker-2");
  });
});

describe("dismissLiveEdit / clearLiveEdits", () => {
  it("removes the current entry by id, emptying the document", () => {
    const doc = "dismiss-one";
    publishLiveEdits([editOn(doc, { summary: "only" })]);
    const [entry] = getLiveEditsFor(doc);
    dismissLiveEdit(doc, entry!.id);
    expect(getLiveEditsFor(doc)).toHaveLength(0);
  });

  it("ignores a dismiss for a stale id once a newer edit replaced it", () => {
    const doc = "dismiss-stale";
    publishLiveEdits([editOn(doc, { summary: "old" })]);
    const [old] = getLiveEditsFor(doc);
    publishLiveEdits([editOn(doc, { summary: "new" })]);
    // A stale auto-dismiss timer firing for the old id must not clear the new one.
    dismissLiveEdit(doc, old!.id);
    const stack = getLiveEditsFor(doc);
    expect(stack).toHaveLength(1);
    expect(stack[0]?.summary).toBe("new");
  });

  it("clears the document's notice", () => {
    const doc = "clear-all";
    publishLiveEdits([editOn(doc)]);
    clearLiveEdits(doc);
    expect(getLiveEditsFor(doc)).toHaveLength(0);
  });
});
