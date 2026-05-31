import { describe, it, expect } from "vitest";
import type { Db } from "~/server/db";
import { persistDocumentContent } from "./cesare-tools";

// ─── In-memory fake DB ─────────────────────────────────────────────────────────
// persistDocumentContent must follow the canonical Spec 44 Agentic Edit Pattern:
// it inserts a NEW non-draft document_versions row and repoints
// documents.current_version_id at it (never updates the active row in place).
//
// There is no PGlite / real-DB harness in this repo, so we model just enough of
// the Drizzle fluent surface that persistDocumentContent exercises: a single
// transaction running select (doc row), select (max version number), insert
// (new version) and update (document). The fake records every write so the test
// can assert the contract on real production code, not on a mock of it.

interface VersionRow {
  id: string;
  documentId: string;
  number: number;
  label: string;
  content: string;
  isDraft: boolean;
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
  versionUpdates: { id: string; set: Record<string, unknown> }[];
  idSeq: number;
}

const buildFakeDb = (state: FakeState): Db => {
  const makeTx = () => {
    const selectBuilder = (columns: Record<string, unknown>) => {
      const wantsMax = "max" in columns;
      const chain = {
        from: () => chain,
        where: () => chain,
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
          return resolve([
            {
              id: state.document.id,
              currentVersionId: state.document.currentVersionId,
              createdBy: state.document.createdBy,
            },
          ]);
        },
      };
      // Support both `await chain` and `const [x] = await chain`.
      return chain as unknown as PromiseLike<Record<string, unknown>[]> & {
        from: () => typeof chain;
        where: () => typeof chain;
        limit: () => typeof chain;
      };
    };

    const insertBuilder = () => {
      let pending: Record<string, unknown> | null = null;
      const chain = {
        values: (v: Record<string, unknown>) => {
          pending = v;
          return chain;
        },
        returning: () => ({
          then: (resolve: (rows: { id: string }[]) => unknown): unknown => {
            const id = `v-${++state.idSeq}`;
            const row: VersionRow = {
              id,
              documentId: pending!["documentId"] as string,
              number: pending!["number"] as number,
              label: pending!["label"] as string,
              content: pending!["content"] as string,
              isDraft: pending!["isDraft"] as boolean,
              createdBy: pending!["createdBy"] as string,
            };
            state.versions.push(row);
            state.insertedVersions.push(row);
            return resolve([{ id }]);
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
            // persistDocumentContent only updates the documents table.
            state.documentUpdates.push(pending as Partial<DocumentRow>);
            state.document = {
              ...state.document,
              ...(pending as Partial<DocumentRow>),
            };
            return resolve(undefined);
          },
        }),
      };
      return chain;
    };

    return {
      select: (columns: Record<string, unknown>) => selectBuilder(columns),
      insert: () => insertBuilder(),
      update: () => updateBuilder(),
    };
  };

  return {
    transaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
      cb(makeTx()),
  } as unknown as Db;
};

describe("persistDocumentContent (Spec 44 Agentic Edit Pattern)", () => {
  const baseState = (): FakeState => ({
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
        createdBy: "user-1",
      },
    ],
    insertedVersions: [],
    documentUpdates: [],
    versionUpdates: [],
    idSeq: 1,
  });

  it("creates a NEW non-draft version and repoints current_version_id", async () => {
    const state = baseState();
    const db = buildFakeDb(state);

    const result = await persistDocumentContent(
      db,
      "doc-1",
      "Un soggetto completamente nuovo generato da Cesare.",
      null,
    );

    expect(result.isOk()).toBe(true);
    const applied = result._unsafeUnwrap();

    // 1. A brand-new version row was inserted (not an in-place update).
    expect(state.insertedVersions).toHaveLength(1);
    const inserted = state.insertedVersions[0]!;
    expect(inserted.isDraft).toBe(false);
    expect(inserted.number).toBe(2);
    expect(inserted.content).toBe(
      "Un soggetto completamente nuovo generato da Cesare.",
    );

    // 2. documents.current_version_id now points at the new version + content.
    const docUpdate = state.documentUpdates.at(-1)!;
    expect(docUpdate["currentVersionId"]).toBe(inserted.id);
    expect(docUpdate["content"]).toBe(
      "Un soggetto completamente nuovo generato da Cesare.",
    );

    // 3. The applied result is NON-NULL and carries the IDs the marker needs.
    expect(applied.versionId).toBe(inserted.id);
    expect(applied.previousVersionId).toBe("v-baseline");
  });

  it("falls back to userIdFallback when the document has no createdBy", async () => {
    const state = baseState();
    state.document.createdBy = null;
    const db = buildFakeDb(state);

    const result = await persistDocumentContent(
      db,
      "doc-1",
      "Nuovo contenuto.",
      "fallback-user",
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
      "Nuovo contenuto.",
      null,
    );

    expect(result.isErr()).toBe(true);
    expect(state.insertedVersions).toHaveLength(0);
  });
});
