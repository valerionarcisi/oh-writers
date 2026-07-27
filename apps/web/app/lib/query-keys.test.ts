import { describe, it, expect, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateFor } from "./query-keys";

/**
 * The registry only helps if it reproduces the keys the app ALREADY uses —
 * otherwise adopting it silently splits each cache in two and every reader
 * goes stale. These assertions pin the shapes against the literals in the
 * feature code, so a drift is a failing test rather than a blank panel.
 */
describe("queryKeys — shapes match the existing literals", () => {
  it("documents", () => {
    expect(queryKeys.documents.detail("p1", "soggetto")).toEqual([
      "documents",
      "p1",
      "soggetto",
    ]);
    expect(queryKeys.documents.currentVersion("d1")).toEqual([
      "documents",
      "current-version",
      "d1",
    ]);
  });

  it("versions — narrative and screenplay are separate families", () => {
    expect(queryKeys.versions.document("d1")).toEqual([
      "document-versions",
      "d1",
    ]);
    expect(queryKeys.versions.screenplay("s1")).toEqual(["versions", "s1"]);
    expect(queryKeys.versions.screenplayCurrent("s1")).toEqual([
      "screenplay-current-version",
      "s1",
    ]);
  });

  it("breakdown — the scene-cost key carries the version (issue #65)", () => {
    expect(queryKeys.breakdown.sceneCost("p1", 3, "v1")).toEqual([
      "breakdown",
      "scene-cost",
      "p1",
      3,
      "v1",
    ]);
  });

  it("budget", () => {
    expect(queryKeys.budget.all("p1")).toEqual(["budget", "p1"]);
    expect(queryKeys.budget.castCrew("p1")).toEqual(["budget-cast-crew", "p1"]);
  });

  it("a detail key nests under its list key, so prefix invalidation reaches it", () => {
    const list = queryKeys.versions.screenplay("s1");
    const detail = queryKeys.versions.detail("v1");
    expect(detail[0]).toBe(list[0]);
  });
});

describe("invalidateFor", () => {
  const spyClient = () => {
    const invalidateQueries = vi.fn();
    return {
      client: { invalidateQueries } as unknown as QueryClient,
      invalidateQueries,
    };
  };

  const keysPassedTo = (fn: ReturnType<typeof vi.fn>): string[] =>
    fn.mock.calls.map((c) =>
      JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
    );

  it("a document write refreshes the doc AND its version list", () => {
    // The bug this exists to prevent: a Cesare edit auto-creates a version, but
    // nothing invalidated the version queries, so the Versions panel kept
    // rendering the pre-turn list and the next manual version looked already
    // active (PR #110).
    const { client, invalidateQueries } = spyClient();
    invalidateFor(client, ["document"]);
    const keys = keysPassedTo(invalidateQueries);
    expect(keys).toContain(JSON.stringify(["documents"]));
    expect(keys).toContain(JSON.stringify(["document-versions"]));
    expect(keys).toContain(JSON.stringify(["documents", "current-version"]));
  });

  it("a screenplay write refreshes scenes and the version pointer", () => {
    const { client, invalidateQueries } = spyClient();
    invalidateFor(client, ["screenplay"]);
    const keys = keysPassedTo(invalidateQueries);
    expect(keys).toContain(JSON.stringify(["scenes"]));
    expect(keys).toContain(JSON.stringify(["versions"]));
    expect(keys).toContain(JSON.stringify(["screenplay-current-version"]));
  });

  it("never invalidates the same family twice for overlapping entities", () => {
    const { client, invalidateQueries } = spyClient();
    invalidateFor(client, ["document", "document", "breakdown"]);
    const keys = keysPassedTo(invalidateQueries);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("invalidates nothing when nothing was written", () => {
    const { client, invalidateQueries } = spyClient();
    invalidateFor(client, []);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

// The point of deriving the entity list from the tool registry: adding a Cesare
// tool must not silently leave a panel stale. If a tool declares a domain this
// registry does not know, the invalidation for it is a no-op — and the only
// symptom would be a user staring at old data. This test turns that into a
// failing build instead.
describe("every Cesare-written domain has query keys", () => {
  it("maps all WRITTEN_DOMAINS", async () => {
    const { WRITTEN_DOMAINS } =
      await import("~/features/predictions/cesare-tool-entity-map");
    const spy = vi.fn();
    const client = { invalidateQueries: spy } as unknown as QueryClient;

    for (const domain of WRITTEN_DOMAINS) {
      spy.mockClear();
      // A cast is unavoidable at the boundary between the tracer's domain union
      // and this module's; the assertion is what makes it safe.
      invalidateFor(client, [domain as never]);
      expect(
        spy.mock.calls.length,
        `domain "${domain}" is written by a Cesare tool but invalidates nothing — add it to FAMILIES_FOR_ENTITY`,
      ).toBeGreaterThan(0);
    }
  });
});
