import { describe, it, expect, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { queryKeys, invalidateFor, FAMILIES_FOR_ENTITY } from "./query-keys";

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

  it("a screenplay write refreshes the script, its versions and derived views", () => {
    const { client, invalidateQueries } = spyClient();
    invalidateFor(client, ["screenplay"]);
    const keys = keysPassedTo(invalidateQueries);
    expect(keys).toContain(JSON.stringify(["screenplay"]));
    expect(keys).toContain(JSON.stringify(["versions"]));
    expect(keys).toContain(JSON.stringify(["screenplay-current-version"]));
    // The derived surfaces, which the first version of this table missed.
    expect(keys).toContain(JSON.stringify(["screenplay-proposals"]));
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

// The gap the first version of this file missed: `invalidateFor` looked
// correct, the completeness test passed, and three prefixes ("scenes",
// "shooting-days", "location-requirements") matched no query in the app —
// invalidating nothing, indistinguishable from working. Meanwhile budget
// declared 3 families where the code has 7, so a Cesare budget write left the
// topsheet and the caps stale.
//
// So the registry is checked against the SOURCE, not against itself.
describe("every declared prefix exists in the feature code", () => {
  const appRoot = fileURLToPath(new URL("../features", import.meta.url));

  /** Every `queryKey: ["<family>"` literal the app actually declares. */
  const declaredFamilies = (): Set<string> => {
    const found = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (/\.test\.tsx?$/.test(entry.name)) continue;
        const src = readFileSync(full, "utf8");
        for (const m of src.matchAll(/queryKey:\s*\[\s*"([a-z0-9-]+)"/g)) {
          found.add(m[1]!);
        }
      }
    };
    walk(appRoot);
    return found;
  };

  it("no entity invalidates a family nothing reads", () => {
    const declared = declaredFamilies();
    // Sanity: the scan found something, so an empty result cannot pass this.
    expect(declared.size).toBeGreaterThan(10);

    const dead: string[] = [];
    for (const [entity, families] of Object.entries(FAMILIES_FOR_ENTITY)) {
      for (const key of families) {
        const head = String(key[0]);
        if (!declared.has(head)) dead.push(`${entity} → "${head}"`);
      }
    }
    expect(
      dead,
      `these prefixes match no queryKey in the app, so they invalidate nothing:\n  ${dead.join("\n  ")}`,
    ).toEqual([]);
  });

  it("covers every family of the entities Cesare writes most", () => {
    const declared = [...declaredFamilies()];
    // A write to one of these fans out into derived views; missing one leaves a
    // panel stale, which is exactly the reported bug class.
    const mustCover: Array<[keyof typeof FAMILIES_FOR_ENTITY, RegExp]> = [
      ["budget", /^budget(-|$)/],
      ["screenplay", /^screenplay(s|-|$)/],
    ];

    for (const [entity, pattern] of mustCover) {
      const covered = new Set(
        FAMILIES_FOR_ENTITY[entity].map((k) => String(k[0])),
      );
      const missing = declared.filter(
        (f) => pattern.test(f) && !covered.has(f),
      );
      expect(
        missing,
        `"${entity}" does not invalidate: ${missing.join(", ")}`,
      ).toEqual([]);
    }
  });
});
