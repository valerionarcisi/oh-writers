// apps/web/app/features/app-shell/cesare-live-edit-store.test.ts
//
// Spec 63 — the per-document stack of live Cesare edits. These pin the contract
// the entity-page card stack relies on: one entry per turn, newest LAST, the
// pre-turn snapshot for ↩ Annulla (option A over fall-back B), and the
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
  it("pushes one entry per turn onto the document stack, newest LAST", () => {
    const doc = "stack-order";
    publishLiveEdits([editOn(doc, { summary: "first" })]);
    publishLiveEdits([editOn(doc, { summary: "second" })]);
    const stack = getLiveEditsFor(doc);
    expect(stack).toHaveLength(2);
    expect(stack[0]?.summary).toBe("first");
    expect(stack[1]?.summary).toBe("second");
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
    // No new report → the second turn must fall back to its own marker, not v1.
    publishLiveEdits([editOn(doc, { previousVersionId: "marker-2" })]);
    const stack = getLiveEditsFor(doc);
    expect(stack[0]?.previousVersionId).toBe("v1");
    expect(stack[1]?.previousVersionId).toBe("marker-2");
  });
});

describe("dismissLiveEdit / clearLiveEdits", () => {
  it("removes one entry by id, leaving the rest of the stack", () => {
    const doc = "dismiss-one";
    publishLiveEdits([editOn(doc, { summary: "keep" })]);
    publishLiveEdits([editOn(doc, { summary: "drop" })]);
    const drop = getLiveEditsFor(doc).find((e) => e.summary === "drop");
    dismissLiveEdit(doc, drop!.id);
    const stack = getLiveEditsFor(doc);
    expect(stack).toHaveLength(1);
    expect(stack[0]?.summary).toBe("keep");
  });

  it("clears the whole stack for one document", () => {
    const doc = "clear-all";
    publishLiveEdits([editOn(doc)]);
    publishLiveEdits([editOn(doc)]);
    clearLiveEdits(doc);
    expect(getLiveEditsFor(doc)).toHaveLength(0);
  });
});
