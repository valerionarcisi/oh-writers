import { describe, it, expect } from "vitest";
import type { Db } from "~/server/db";
import { importAsActiveVersionTx } from "./versions.server";

// ─── In-memory fake tx ─────────────────────────────────────────────────────────
// importAsActiveVersionTx must follow Spec 71: insert a NEW screenplay_versions
// row carrying the imported Fountain, repoint screenplays.current_version_id at
// it, and clear screenplays.pm_doc + yjs_state so the editor reseeds from the
// imported content on remount. The previous draft row must stay intact.
//
// There is no PGlite / real-DB harness in this repo (see cesare-persist.test),
// so we model just enough of the Drizzle fluent surface that the tx exercises:
//   - select({max}) → next version number
//   - select({color,number}).orderBy → next draft colour
//   - insert(versions).returning → new version row
//   - update(screenplays).set().where → the repoint + clear
//   - insert(scenes).onConflictDoUpdate / delete(scenes).returning → scene mirror
//   - tx.query.screenplays.findFirst → the returned row
//   - select(...).from().innerJoin().where() → breakdown clone source (empty here)
// The fake records every write so the test asserts the contract on the real
// production code, not on a mock of it.

interface VersionRow {
  id: string;
  screenplayId: string;
  number: number;
  label: string | null;
  content: string;
  pageCount: number;
  yjsSnapshot: Buffer | null;
  draftColor: string | null;
  createdBy: string;
}

interface ScreenplayRow {
  id: string;
  currentVersionId: string | null;
  content: string;
  pmDoc: Record<string, unknown> | null;
  yjsState: Buffer | null;
  pageCount: number;
  breakdownStale: boolean;
  createdBy: string;
}

interface FakeState {
  screenplay: ScreenplayRow;
  versions: VersionRow[];
  insertedVersions: VersionRow[];
  screenplayUpdates: Partial<ScreenplayRow>[];
  insertedScenes: Record<string, unknown>[];
  idSeq: number;
}

// Which table an insert/delete targets is inferred from the row shape the
// builder receives — the fake never sees the Drizzle table object, only values.
const buildFakeTx = (state: FakeState) => {
  const selectBuilder = (columns: Record<string, unknown>) => {
    const wantsMax = "max" in columns;
    const wantsColor = "color" in columns;
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (
        resolve: (rows: Record<string, unknown>[]) => unknown,
      ): unknown => {
        if (wantsMax) {
          const max = state.versions.reduce(
            (acc, v) => Math.max(acc, v.number),
            0,
          );
          return resolve([{ max }]);
        }
        if (wantsColor) {
          return resolve(
            state.versions.map((v) => ({
              color: v.draftColor,
              number: v.number,
            })),
          );
        }
        // Breakdown clone source query — nothing tagged in this fixture.
        return resolve([]);
      },
    };
    return chain as unknown as PromiseLike<Record<string, unknown>[]> &
      typeof chain;
  };

  const insertBuilder = () => {
    let pending: Record<string, unknown> = {};
    const chain = {
      values: (v: Record<string, unknown>) => {
        pending = v;
        return chain;
      },
      // Versions insert resolves through .returning().then.
      returning: () => ({
        then: (resolve: (rows: { id: string }[]) => unknown): unknown => {
          const id = `v-${++state.idSeq}`;
          const row: VersionRow = {
            id,
            screenplayId: pending["screenplayId"] as string,
            number: pending["number"] as number,
            label: (pending["label"] as string | null) ?? null,
            content: pending["content"] as string,
            pageCount: pending["pageCount"] as number,
            yjsSnapshot: (pending["yjsSnapshot"] as Buffer | null) ?? null,
            draftColor: (pending["draftColor"] as string | null) ?? null,
            createdBy: pending["createdBy"] as string,
          };
          state.versions.push(row);
          state.insertedVersions.push(row);
          return resolve([{ id }]);
        },
      }),
      // Scenes insert resolves through .onConflictDoUpdate().then (no returning).
      onConflictDoUpdate: () => ({
        then: (resolve: (r: unknown) => unknown): unknown => {
          state.insertedScenes.push(pending);
          return resolve(undefined);
        },
      }),
    };
    return chain;
  };

  const updateBuilder = () => {
    let pending: Record<string, unknown> = {};
    const chain = {
      set: (v: Record<string, unknown>) => {
        pending = v;
        return chain;
      },
      where: () => ({
        then: (resolve: (r: unknown) => unknown): unknown => {
          state.screenplayUpdates.push(pending as Partial<ScreenplayRow>);
          state.screenplay = {
            ...state.screenplay,
            ...(pending as Partial<ScreenplayRow>),
          };
          return resolve(undefined);
        },
      }),
    };
    return chain;
  };

  const deleteBuilder = () => {
    const chain = {
      where: () => chain,
      returning: () => ({
        then: (resolve: (rows: { id: string }[]) => unknown): unknown =>
          resolve([]),
      }),
    };
    return chain;
  };

  return {
    select: (columns: Record<string, unknown>) => selectBuilder(columns),
    insert: () => insertBuilder(),
    update: () => updateBuilder(),
    delete: () => deleteBuilder(),
    query: {
      screenplays: {
        findFirst: async () => state.screenplay,
      },
    },
  };
};

const FOUNTAIN = `INT. RISTORANTE - GIORNO

Filippo entra nel locale.

FILIPPO
Buongiorno a tutti.`;

describe("importAsActiveVersionTx (Spec 71)", () => {
  const baseState = (): FakeState => ({
    screenplay: {
      id: "sp-1",
      currentVersionId: "v-old",
      content: "VECCHIA bozza prima dell'import.",
      pmDoc: { type: "doc", content: [] },
      yjsState: Buffer.from([1, 2, 3]),
      pageCount: 4,
      breakdownStale: false,
      createdBy: "user-1",
    },
    versions: [
      {
        id: "v-old",
        screenplayId: "sp-1",
        number: 1,
        label: "Versione 1",
        content: "VECCHIA bozza prima dell'import.",
        pageCount: 4,
        yjsSnapshot: Buffer.from([9]),
        draftColor: "white",
        createdBy: "user-1",
      },
    ],
    insertedVersions: [],
    screenplayUpdates: [],
    insertedScenes: [],
    idSeq: 1,
  });

  it("inserts a NEW version carrying the imported Fountain and activates it", async () => {
    const state = baseState();
    const tx = buildFakeTx(state) as unknown as Parameters<
      typeof importAsActiveVersionTx
    >[0];

    const updated = await importAsActiveVersionTx(tx, {
      screenplayId: "sp-1",
      label: "Versione 2",
      content: FOUNTAIN,
      prevActiveId: "v-old",
      userId: "user-1",
    });

    // 1. A brand-new version row was inserted (not an in-place update).
    expect(state.insertedVersions).toHaveLength(1);
    const newVersion = state.insertedVersions[0]!;
    expect(newVersion.content).toBe(FOUNTAIN);
    expect(newVersion.label).toBe("Versione 2");
    // number = max(existing) + 1.
    expect(newVersion.number).toBe(2);
    // 2. Its CRDT snapshot is SEEDED from the imported Fountain server-side so
    // the room is authoritative and the empty-seed autosave can't clobber it.
    expect(newVersion.yjsSnapshot).toBeInstanceOf(Buffer);
    expect(newVersion.yjsSnapshot!.length).toBeGreaterThan(0);

    // 3. The screenplay was repointed at the new version and reseeded clean.
    expect(state.screenplayUpdates).toHaveLength(1);
    const patch = state.screenplayUpdates[0]!;
    expect(patch.currentVersionId).toBe(newVersion.id);
    expect(patch.content).toBe(FOUNTAIN);
    expect(patch.pmDoc).toBeNull();
    // yjsState mirrors the seeded snapshot (not null) so a legacy room also
    // loads the imported content.
    expect(patch.yjsState).toBeInstanceOf(Buffer);
    expect(patch.breakdownStale).toBe(true);

    // 4. The previous draft row is untouched (still holds the old text).
    const oldRow = state.versions.find((v) => v.id === "v-old")!;
    expect(oldRow.content).toBe("VECCHIA bozza prima dell'import.");

    // 5. The returned row reflects the activation.
    expect(updated.currentVersionId).toBe(newVersion.id);
    expect(updated.content).toBe(FOUNTAIN);

    // 6. The imported scene was mirrored into the scenes table.
    expect(state.insertedScenes.length).toBeGreaterThan(0);
    expect(state.insertedScenes[0]!["heading"]).toContain("RISTORANTE");
  });

  it("continues the version number from the highest existing version", async () => {
    const state = baseState();
    state.versions.push({
      ...state.versions[0]!,
      id: "v-3",
      number: 5,
    });
    const tx = buildFakeTx(state) as unknown as Parameters<
      typeof importAsActiveVersionTx
    >[0];

    await importAsActiveVersionTx(tx, {
      screenplayId: "sp-1",
      label: "Import",
      content: FOUNTAIN,
      prevActiveId: "v-old",
      userId: "user-1",
    });

    expect(state.insertedVersions[0]!.number).toBe(6);
  });
});
