// apps/web/app/features/app-shell/split-drawer-history.test.ts
//
// Unit tests for the pure history-stack transition (`nextHistory`) that backs
// the shared navigable split host (Spec 78 A6). The stack is a browser-like
// history: re-opening a surface already in the stack NAVIGATES to it (cursor
// jumps, no duplicate); a genuinely new surface appends after the live cursor,
// dropping the forward ("redo") tail; the cursor stays in range for every input.
// These invariants are what keep the host from degenerating into the permanent-
// collapse state (Bug 4) and from no-opping a re-open (Bug 1 family).

import { describe, it, expect } from "vitest";
import { nextHistory } from "./split-drawer-context";
import type {
  SplitDrawerPayload,
  SplitDrawerCesarePeekPayload,
  SplitDrawerVersionsPayload,
  SplitDrawerNotificationsPayload,
} from "./split-drawer-context";

const cesare: SplitDrawerCesarePeekPayload = { kind: "cesare-peek" };
const notifications: SplitDrawerNotificationsPayload = {
  kind: "notifications",
};
const versions = (
  documentId: string,
  extra?: Partial<SplitDrawerVersionsPayload>,
): SplitDrawerVersionsPayload => ({
  kind: "versions",
  documentId,
  currentVersionId: extra?.currentVersionId ?? null,
  versionKind: extra?.versionKind ?? null,
});

const keys = (h: ReadonlyArray<SplitDrawerPayload>) =>
  h.map((p) => (p.kind === "versions" ? `versions:${p.documentId}` : p.kind));

describe("nextHistory — pure history-stack transition", () => {
  it("pushes the first entry and points the cursor at it (from empty)", () => {
    const r = nextHistory([], -1, cesare);
    expect(keys(r.history)).toEqual(["cesare-peek"]);
    expect(r.cursor).toBe(0);
  });

  it("appends a new entry after the live cursor and advances the cursor", () => {
    const r = nextHistory([cesare], 0, versions("d1"));
    expect(keys(r.history)).toEqual(["cesare-peek", "versions:d1"]);
    expect(r.cursor).toBe(1);
  });

  it("MOVES an existing entry to the front (most-recent), never duplicating it — BUG-N67", () => {
    const prev = [versions("d1"), cesare];
    // cursor at Cesare (1); re-open the versions surface already at index 0.
    // Move-to-front: versions is removed from idx0 and re-appended at the end,
    // cursor lands on it — it does NOT jump the cursor backward to idx0.
    const r = nextHistory(prev, 1, versions("d1"));
    expect(keys(r.history)).toEqual(["cesare-peek", "versions:d1"]);
    expect(r.cursor).toBe(1); // the just-re-opened surface, now most-recent
  });

  it("refreshes an existing versions entry IN PLACE (same key, new companions) without duplicating", () => {
    const prev = [versions("d1", { currentVersionId: "v1" })];
    const r = nextHistory(prev, 0, versions("d1", { currentVersionId: "v2" }));
    expect(keys(r.history)).toEqual(["versions:d1"]);
    expect(r.cursor).toBe(0);
    const entry = r.history[0] as SplitDrawerVersionsPayload;
    expect(entry.currentVersionId).toBe("v2"); // refreshed in place
  });

  it("drops the forward ('redo') tail when a new entry is pushed from a back-stepped cursor", () => {
    const prev = [cesare, versions("d1"), notifications];
    // cursor stepped back to index 0 (Cesare); pushing a NEW surface truncates
    // the forward entries (versions, notifications) and appends.
    const r = nextHistory(prev, 0, versions("d2"));
    expect(keys(r.history)).toEqual(["cesare-peek", "versions:d2"]);
    expect(r.cursor).toBe(1);
  });

  it("never produces duplicate keys (re-opening across a longer stack moves to front, not appends a dup)", () => {
    const prev = [cesare, versions("d1"), notifications];
    // Re-open Cesare (already at idx0): move-to-front removes it and re-appends
    // it at the end — same length, no duplicate, cursor on the moved entry.
    const r = nextHistory(prev, 2, cesare);
    expect(keys(r.history)).toEqual([
      "versions:d1",
      "notifications",
      "cesare-peek",
    ]);
    expect(new Set(keys(r.history)).size).toBe(keys(r.history).length);
    expect(r.cursor).toBe(2);
  });

  it("clamps an out-of-range (too-high) cursor so the stack is never silently dropped — Bug 4", () => {
    // A degenerate cursor past the end must NOT slice the whole array away.
    const prev = [cesare, versions("d1")];
    const r = nextHistory(prev, 99, notifications);
    expect(keys(r.history)).toEqual([
      "cesare-peek",
      "versions:d1",
      "notifications",
    ]);
    expect(r.cursor).toBe(2);
  });

  it("clamps a negative cursor (treats it as 'before the start') and appends", () => {
    const prev = [cesare];
    const r = nextHistory(prev, -5, versions("d1"));
    // safeCursor clamps to -1 → base is empty → append after nothing.
    expect(keys(r.history)).toEqual(["versions:d1"]);
    expect(r.cursor).toBe(0);
  });

  it("the 5-open sequence (C→V→N→V→C) keeps all THREE distinct surfaces reachable — BUG-N67", () => {
    // The exact user sequence that stranded Notifiche under the old jump-back
    // semantics. Replay it through the pure reducer and assert the navigable
    // stack still holds all three distinct surfaces, the cursor in range.
    let history: ReadonlyArray<SplitDrawerPayload> = [];
    let cursor = -1;
    const apply = (p: SplitDrawerPayload) => {
      const r = nextHistory(history, cursor, p);
      history = r.history;
      cursor = r.cursor;
    };
    apply(cesare); // [C] @0
    apply(versions("d1")); // [C,V] @1
    apply(notifications); // [C,V,N] @2
    apply(versions("d1")); // re-open V → [C,N,V] @2
    apply(cesare); // re-open C → [N,V,C] @2

    expect(keys(history)).toEqual([
      "notifications",
      "versions:d1",
      "cesare-peek",
    ]);
    expect(cursor).toBe(2);
    // No duplicates: exactly the three distinct surfaces.
    expect(new Set(keys(history)).size).toBe(3);
    expect(cursor).toBeGreaterThanOrEqual(0);
    expect(cursor).toBeLessThan(history.length);

    // Walking ALL the way back from the cursor must VISIT every distinct surface
    // — none stranded as forward-only. Simulate the ← walk over the final stack.
    const visited = new Set<string>();
    for (let c = cursor; c >= 0; c--) {
      const k = keys(history)[c]!;
      visited.add(k);
    }
    expect(visited).toEqual(
      new Set(["cesare-peek", "versions:d1", "notifications"]),
    );
  });

  it("re-opening NEVER strands a distinct surface as forward-only (cursor at the most-recent entry)", () => {
    // After move-to-front, the cursor is always at the LAST index, so there are
    // no forward entries — everything is reachable by walking back.
    const r = nextHistory(
      [notifications, versions("d1"), cesare],
      2,
      versions("d1"),
    );
    expect(keys(r.history)).toEqual([
      "notifications",
      "cesare-peek",
      "versions:d1",
    ]);
    expect(r.cursor).toBe(r.history.length - 1);
  });

  it("keeps the returned cursor a VALID index into the returned history for every input", () => {
    const cases: Array<{
      prev: ReadonlyArray<SplitDrawerPayload>;
      cursor: number;
      next: SplitDrawerPayload;
    }> = [
      { prev: [], cursor: -1, next: cesare },
      { prev: [cesare], cursor: 0, next: versions("d1") },
      { prev: [cesare, versions("d1")], cursor: 1, next: cesare },
      { prev: [cesare, versions("d1")], cursor: 99, next: notifications },
      { prev: [cesare], cursor: -9, next: versions("d2") },
    ];
    for (const c of cases) {
      const r = nextHistory(c.prev, c.cursor, c.next);
      expect(r.cursor).toBeGreaterThanOrEqual(0);
      expect(r.cursor).toBeLessThan(r.history.length);
    }
  });
});
