import { describe, it, expect } from "vitest";
import { documents, documentVersions } from "@oh-writers/db/schema";
import { DocumentTypes } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { persistDocumentContent } from "./cesare-tools";

// ─── In-memory fake DB ─────────────────────────────────────────────────────────
// [OHW-075] persistDocumentContent is the document-edit tools' write path
// (apply_text_edit / expand_section / compress_section). Since Spec 75 it
// delegates to `applyVersionLive` — the single document write path — so the
// turn-group policy applies: with no session every edit INSERTS a version (the
// pre-N66 behaviour, never less safe); with a session the working version is
// overwritten in place. The retired per-turn "Cesare · modifica N" insert must
// never come back.
//
// There is no PGlite / real-DB harness in this repo, so we model just enough of
// the Drizzle fluent surface, dispatched by TABLE identity, that the delegated
// applyVersionLive exercises: selects on documents + document_versions, insert
// returning, updates on both tables, all inside `db.transaction`. The fake
// records every write so the test asserts the contract on production code.

interface VersionRow {
  id: string;
  documentId: string;
  number: number;
  label: string;
  content: string;
  isDraft: boolean;
  cesareSessionId: string | null;
  updatedAt: Date;
  createdBy: string;
}

interface DocumentRow {
  id: string;
  currentVersionId: string | null;
  createdBy: string | null;
  content: string;
}

interface FakeState {
  document: DocumentRow;
  versions: VersionRow[];
  insertedVersions: VersionRow[];
  documentUpdates: Partial<DocumentRow>[];
  versionUpdates: Record<string, unknown>[];
  idSeq: number;
}

const buildFakeDb = (state: FakeState): Db => {
  const currentVersion = (): VersionRow | null =>
    state.versions.find((v) => v.id === state.document.currentVersionId) ??
    null;

  const select = (columns: Record<string, unknown>) => ({
    from: (table: unknown) => {
      const resolveRows = (): unknown[] => {
        if (table === documents) {
          return [
            {
              id: state.document.id,
              currentVersionId: state.document.currentVersionId,
              createdBy: state.document.createdBy,
              content: state.document.content,
            },
          ];
        }
        if ("max" in columns) {
          return [
            { max: state.versions.reduce((m, v) => Math.max(m, v.number), 0) },
          ];
        }
        if ("cesareSessionId" in columns) {
          const current = currentVersion();
          return current ? [current] : [];
        }
        // existing-version contents (insert-path duplicate guard)
        return state.versions.map((v) => ({ content: v.content }));
      };
      const whereResult = {
        then: (resolve: (rows: unknown[]) => unknown): unknown =>
          resolve(resolveRows()),
        limit: () => Promise.resolve(resolveRows()),
      };
      return { where: () => whereResult };
    },
  });

  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      returning: () => {
        const id = `v-${++state.idSeq}`;
        const row: VersionRow = {
          id,
          documentId: v["documentId"] as string,
          number: v["number"] as number,
          label: v["label"] as string,
          content: v["content"] as string,
          isDraft: v["isDraft"] as boolean,
          cesareSessionId: (v["cesareSessionId"] as string | null) ?? null,
          updatedAt: new Date(),
          createdBy: v["createdBy"] as string,
        };
        state.versions.push(row);
        state.insertedVersions.push(row);
        return Promise.resolve([{ id }]);
      },
    }),
  });

  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === documentVersions) {
          state.versionUpdates.push(values);
          const current = currentVersion();
          if (current) {
            if (typeof values["content"] === "string") {
              current.content = values["content"];
            }
            if (typeof values["label"] === "string") {
              current.label = values["label"];
            }
          }
        } else {
          state.documentUpdates.push(values as Partial<DocumentRow>);
          state.document = {
            ...state.document,
            ...(values as Partial<DocumentRow>),
          };
        }
        return Promise.resolve();
      },
    }),
  });

  const db = {
    select,
    insert,
    update,
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
      cb(db),
  } as unknown as Db;

  return db;
};

const SESSION_A = "00000000-0000-4000-a000-0000000000aa";

describe("persistDocumentContent (Spec 75 turn-group policy)", () => {
  const baseState = (
    versionOverrides: Partial<VersionRow> = {},
  ): FakeState => ({
    document: {
      id: "doc-1",
      currentVersionId: "v-baseline",
      createdBy: "user-1",
      content: "Milano, fine anni Novanta. Marta…",
    },
    versions: [
      {
        id: "v-baseline",
        documentId: "doc-1",
        number: 1,
        label: "baseline",
        content: "Milano, fine anni Novanta. Marta…",
        isDraft: false,
        cesareSessionId: null,
        updatedAt: new Date(),
        createdBy: "user-1",
        ...versionOverrides,
      },
    ],
    insertedVersions: [],
    documentUpdates: [],
    versionUpdates: [],
    idSeq: 1,
  });

  const NO_SESSION = { cesareSessionId: null, intent: "overwrite" } as const;

  it("with no session: creates a NEW non-draft version and repoints current_version_id (pre-N66 fallback)", async () => {
    const state = baseState();
    const db = buildFakeDb(state);

    const result = await persistDocumentContent(
      db,
      "doc-1",
      DocumentTypes.SOGGETTO,
      "Un soggetto completamente nuovo generato da Cesare.",
      null,
      NO_SESSION,
    );

    expect(result.isOk()).toBe(true);
    const applied = result._unsafeUnwrap();

    expect(state.insertedVersions).toHaveLength(1);
    const inserted = state.insertedVersions[0]!;
    expect(inserted.isDraft).toBe(false);
    expect(inserted.number).toBe(2);
    expect(inserted.content).toBe(
      "Un soggetto completamente nuovo generato da Cesare.",
    );
    // The retired per-turn label must never come back.
    expect(inserted.label).not.toMatch(/modifica \d/);
    expect(inserted.label).toBe("Cesare · soggetto");

    const docUpdate = state.documentUpdates.at(-1)!;
    expect(docUpdate["currentVersionId"]).toBe(inserted.id);
    expect(docUpdate["content"]).toBe(
      "Un soggetto completamente nuovo generato da Cesare.",
    );

    expect(applied.versionId).toBe(inserted.id);
    expect(applied.previousVersionId).toBe("v-baseline");
  });

  it("same session + fresh working version: OVERWRITES it in place — no new version row", async () => {
    const state = baseState({ cesareSessionId: SESSION_A });
    const db = buildFakeDb(state);

    const result = await persistDocumentContent(
      db,
      "doc-1",
      DocumentTypes.SOGGETTO,
      "Il soggetto rivisto, ancora nello stesso gruppo di lavoro.",
      null,
      { cesareSessionId: SESSION_A, intent: "overwrite" },
    );

    expect(result.isOk()).toBe(true);
    const applied = result._unsafeUnwrap();

    // No insert — the working version was rewritten in place.
    expect(state.insertedVersions).toHaveLength(0);
    expect(state.versionUpdates).toHaveLength(1);
    expect(state.versionUpdates[0]!["content"]).toBe(
      "Il soggetto rivisto, ancora nello stesso gruppo di lavoro.",
    );
    expect(applied.versionId).toBe("v-baseline");
    // Overwrite turns carry no per-turn revert target (Spec 75).
    expect(applied.previousVersionId).toBe(null);
  });

  it("explicit intent 'new' with the same session: inserts a new version anyway", async () => {
    const state = baseState({ cesareSessionId: SESSION_A });
    const db = buildFakeDb(state);

    const result = await persistDocumentContent(
      db,
      "doc-1",
      DocumentTypes.SOGGETTO,
      "Una nuova versione chiesta esplicitamente dall'utente.",
      null,
      { cesareSessionId: SESSION_A, intent: "new" },
    );

    expect(result.isOk()).toBe(true);
    expect(state.insertedVersions).toHaveLength(1);
    expect(state.insertedVersions[0]!.cesareSessionId).toBe(SESSION_A);
  });

  it("falls back to userIdFallback when the document has no createdBy", async () => {
    const state = baseState();
    state.document.createdBy = null;
    const db = buildFakeDb(state);

    const result = await persistDocumentContent(
      db,
      "doc-1",
      DocumentTypes.SOGGETTO,
      "Nuovo contenuto.",
      "fallback-user",
      NO_SESSION,
    );

    expect(result.isOk()).toBe(true);
    expect(state.insertedVersions[0]!.createdBy).toBe("fallback-user");
  });

  it("errors when neither createdBy nor a fallback user is available", async () => {
    const state = baseState();
    state.document.createdBy = null;
    const db = buildFakeDb(state);

    const result = await persistDocumentContent(
      db,
      "doc-1",
      DocumentTypes.SOGGETTO,
      "Nuovo contenuto.",
      null,
      NO_SESSION,
    );

    expect(result.isErr()).toBe(true);
    expect(state.insertedVersions).toHaveLength(0);
  });
});
