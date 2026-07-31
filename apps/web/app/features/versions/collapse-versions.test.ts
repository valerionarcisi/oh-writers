import { describe, it, expect } from "vitest";
import { collapseVersions } from "./collapse-versions";
import type { VersionView } from "./version-view";

const v = (over: Partial<VersionView>): VersionView => ({
  id: "id",
  number: 1,
  label: null,
  createdAt: "2026-06-19T00:00:00.000Z",
  content: "",
  draftColor: null,
  draftDate: null,
  kind: "manual",
  cesareSessionId: null,
  ...over,
});

describe("[OHW-N66] collapseVersions", () => {
  it("folds a session's working rows under its checkpoint", () => {
    const entries = collapseVersions([
      v({ id: "w2", number: 4, kind: "working", cesareSessionId: "s1" }),
      v({ id: "w1", number: 3, kind: "working", cesareSessionId: "s1" }),
      v({ id: "cp", number: 2, kind: "checkpoint", cesareSessionId: "s1" }),
      v({ id: "m1", number: 1, kind: "manual" }),
    ]);
    // One entry for the session (anchored on the checkpoint) + one manual.
    expect(entries).toHaveLength(2);
    expect(entries[0]?.anchor.id).toBe("cp");
    expect(entries[0]?.working.map((w) => w.id)).toEqual(["w2", "w1"]);
    expect(entries[1]?.anchor.id).toBe("m1");
    expect(entries[1]?.working).toEqual([]);
  });

  it("leaves manual versions standalone", () => {
    const entries = collapseVersions([
      v({ id: "m2", number: 2, kind: "manual" }),
      v({ id: "m1", number: 1, kind: "manual" }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.working.length === 0)).toBe(true);
  });

  it("surfaces orphaned working rows standalone, IN PLACE (creation order)", () => {
    const entries = collapseVersions([
      v({ id: "w1", number: 2, kind: "working", cesareSessionId: "sX" }),
      v({ id: "m1", number: 1, kind: "manual" }),
    ]);
    // The working row is not hidden AND keeps its newest-first position — it
    // used to be appended after everything else, sinking the newest version to
    // the bottom of the list.
    expect(entries.map((e) => e.anchor.id)).toEqual(["w1", "m1"]);
  });

  it("keeps an orphaned working row in creation order among older manual rows", () => {
    const entries = collapseVersions([
      v({ id: "m3", number: 6, kind: "manual" }),
      v({ id: "m2", number: 4, kind: "manual" }),
      v({ id: "w-orphan", number: 3, kind: "working", cesareSessionId: "sX" }),
      v({ id: "m1", number: 1, kind: "manual" }),
    ]);
    expect(entries.map((e) => e.anchor.id)).toEqual([
      "m3",
      "m2",
      "w-orphan",
      "m1",
    ]);
  });

  it("keeps two sessions' working rows under their own checkpoints", () => {
    const entries = collapseVersions([
      v({ id: "b-w", number: 4, kind: "working", cesareSessionId: "sB" }),
      v({ id: "b-cp", number: 3, kind: "checkpoint", cesareSessionId: "sB" }),
      v({ id: "a-w", number: 2, kind: "working", cesareSessionId: "sA" }),
      v({ id: "a-cp", number: 1, kind: "checkpoint", cesareSessionId: "sA" }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.anchor.id).toBe("b-cp");
    expect(entries[0]?.working.map((w) => w.id)).toEqual(["b-w"]);
    expect(entries[1]?.anchor.id).toBe("a-cp");
    expect(entries[1]?.working.map((w) => w.id)).toEqual(["a-w"]);
  });
});
