import { beforeEach, describe, expect, it, vi } from "vitest";

// DB strategy: we MOCK `@oh-writers/db` rather than hit a real Postgres.
//
// Why: the CI "Unit (Vitest)" lane (`.github/workflows/qa.yml`) runs
// `pnpm test:unit` with NO postgres service and NO `DATABASE_URL`. The db
// package's `client.ts` throws "DATABASE_URL is required" at import time, so a
// real round-trip simply cannot run in that lane (this is also why the sibling
// `ws-integration.test.ts` is `describe.skip` without `DATABASE_URL`). Mocking
// the db boundary is the only approach that runs deterministically in CI.
//
// The mock backs `findFirst`/`update` with an in-memory store keyed by id, so
// the Yjs encode→persist→load→decode round-trip is REAL — only the SQL layer is
// faked. `vi.mock` replaces the module before evaluation, so the real
// `client.ts` (and its env guard) never runs.

// All shared state + the schema markers live inside `vi.hoisted` so the hoisted
// `vi.mock` factories below can reference them (a plain top-level const would be
// uninitialised when the hoisted factory runs).
const fixture = vi.hoisted(() => {
  interface YjsRow {
    yjsState: Uint8Array | null;
  }

  // One in-memory table per room kind, keyed by row id.
  const tables = {
    screenplays: new Map<string, YjsRow>(),
    documents: new Map<string, YjsRow>(),
    screenplayBranches: new Map<string, YjsRow>(),
  };

  type TableName = keyof typeof tables;

  // Marker objects standing in for the Drizzle table refs. Each carries its
  // table name in `__table` (read by the mocked `db.update`) and an `id` column
  // whose value the mocked `eq` echoes back so `findFirst`/`where` find the id.
  const tableMarkers: Record<TableName, { __table: TableName; id: TableName }> =
    {
      screenplays: { __table: "screenplays", id: "screenplays" },
      documents: { __table: "documents", id: "documents" },
      screenplayBranches: {
        __table: "screenplayBranches",
        id: "screenplayBranches",
      },
    };

  return { tables, tableMarkers };
});

vi.mock("@oh-writers/db", () => {
  const { tables } = fixture;
  type TableName = keyof typeof tables;

  const makeFindFirst =
    (name: TableName) => async (args: { where: { id: string } }) =>
      tables[name].get(args.where.id);

  const update = (marker: { __table: TableName }) => ({
    set: (values: { yjsState: Uint8Array }) => ({
      where: async (where: { id: string }): Promise<void> => {
        tables[marker.__table].set(where.id, { yjsState: values.yjsState });
      },
    }),
  });

  return {
    db: {
      query: {
        screenplays: { findFirst: makeFindFirst("screenplays") },
        documents: { findFirst: makeFindFirst("documents") },
        screenplayBranches: {
          findFirst: makeFindFirst("screenplayBranches"),
        },
      },
      update,
    },
  };
});

// `eq(col, value)` must yield `{ id: value }` so the mocked findFirst/where can
// read the targeted id. The real `eq` returns an opaque SQL node we don't use.
vi.mock("drizzle-orm", () => ({
  eq: (_column: unknown, value: string) => ({ id: value }),
}));

// The schema exports resolve to the table markers, so `db.update(screenplays)`
// and `eq(screenplays.id, ...)` route to the right in-memory table.
vi.mock("@oh-writers/db/schema", () => fixture.tableMarkers);

import { flushRoom, loadYjsState } from "./persistence.js";
import { Doc, applyUpdate } from "./yjs-shared.js";
import type { ParsedRoom } from "./room-id.js";

const ROOMS: ReadonlyArray<{ kind: ParsedRoom["kind"]; id: string }> = [
  { kind: "screenplay", id: "sp-1" },
  { kind: "document", id: "doc-1" },
  { kind: "branch", id: "br-1" },
];

const seedDoc = (text: string): Doc => {
  const doc = new Doc();
  doc.getText("content").insert(0, text);
  return doc;
};

beforeEach(() => {
  fixture.tables.screenplays.clear();
  fixture.tables.documents.clear();
  fixture.tables.screenplayBranches.clear();
});

describe("flushRoom → loadYjsState round-trip", () => {
  for (const room of ROOMS) {
    it(`persists and reloads a ${room.kind} room`, async () => {
      const original = seedDoc(`hello ${room.kind}`);

      await flushRoom(room, original);
      const loaded = await loadYjsState(room);

      expect(loaded).not.toBeNull();

      const restored = new Doc();
      applyUpdate(restored, loaded as Uint8Array);

      expect(restored.getText("content").toString()).toBe(`hello ${room.kind}`);
    });
  }

  it("round-trips a later mutation (re-flush overwrites prior state)", async () => {
    const room = ROOMS[0]!;
    const doc = seedDoc("v1");
    await flushRoom(room, doc);

    doc.getText("content").insert(2, " v2");
    await flushRoom(room, doc);

    const loaded = await loadYjsState(room);
    const restored = new Doc();
    applyUpdate(restored, loaded as Uint8Array);

    expect(restored.getText("content").toString()).toBe("v1 v2");
  });
});

describe("loadYjsState on a never-synced row", () => {
  for (const room of ROOMS) {
    it(`returns null for an absent ${room.kind} row`, async () => {
      expect(await loadYjsState(room)).toBeNull();
    });
  }

  it("returns null when the row exists but yjsState is null", async () => {
    fixture.tables.screenplays.set("sp-1", { yjsState: null });
    expect(await loadYjsState({ kind: "screenplay", id: "sp-1" })).toBeNull();
  });
});
