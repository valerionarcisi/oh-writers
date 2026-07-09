import { describe, it, expect, vi } from "vitest";
import type { Db } from "~/server/db";
import {
  fetchEditorialAdviceDecisionsBlock,
  upsertEditorialAdviceDecision,
} from "./editorial-advice-decisions.server";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

const buildDecisionsDb = (
  rows: Array<{
    docType: string;
    sceneId: string | null;
    area: string;
    anchorText: string;
    titleFingerprint: string;
    status: string;
  }>,
) => {
  const findMany = vi.fn(() => Promise.resolve(rows));
  const db = {
    query: { editorialAdviceDecisions: { findMany } },
  } as unknown as Db;
  return { db, findMany };
};

describe("fetchEditorialAdviceDecisionsBlock", () => {
  it("returns an empty string when there are no decisions (no empty header)", async () => {
    const { db } = buildDecisionsDb([]);
    const block = await fetchEditorialAdviceDecisionsBlock(
      db,
      PROJECT_ID,
      "soggetto",
    );
    expect(block).toBe("");
  });

  it("renders the anti-repetition block for existing decisions", async () => {
    const { db } = buildDecisionsDb([
      {
        docType: "soggetto",
        sceneId: null,
        area: "structure",
        anchorText: "svolta pentimento",
        titleFingerprint: "snodo centrale",
        status: "authorial_choice",
      },
    ]);
    const block = await fetchEditorialAdviceDecisionsBlock(
      db,
      PROJECT_ID,
      "soggetto",
    );
    expect(block).toContain("Note già decise dall'autore");
    expect(block).toContain(
      '[structure] "svolta pentimento" → scelta autoriale',
    );
  });

  it("scopes the query to the given docType/sceneId", async () => {
    const { db, findMany } = buildDecisionsDb([]);
    await fetchEditorialAdviceDecisionsBlock(db, PROJECT_ID, "screenplay");
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

const buildInsertDb = () => {
  const onConflictDoUpdate = vi.fn(
    (_args: { target: unknown[]; set: { status: string; updatedAt: Date } }) =>
      Promise.resolve(),
  );
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const db = { insert } as unknown as Db;
  return { db, insert, values, onConflictDoUpdate };
};

describe("upsertEditorialAdviceDecision", () => {
  const docLevelKey = {
    docType: "soggetto",
    sceneId: null,
    area: "structure",
    anchorText: "svolta pentimento",
    titleFingerprint: "snodo centrale",
  };

  const sceneKey = {
    docType: "screenplay",
    sceneId: "22222222-2222-2222-2222-222222222222",
    area: "dialogue",
    anchorText: "non voglio più",
    titleFingerprint: "battuta ridondante",
  };

  it("inserts with the given status", async () => {
    const { db, values } = buildInsertDb();
    await upsertEditorialAdviceDecision(db, PROJECT_ID, docLevelKey, "ignored");
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, status: "ignored" }),
    );
  });

  // Regression guard: a plain UNIQUE constraint over a nullable sceneId never
  // matches two NULL rows in Postgres, so doc-level decisions must target a
  // partial index scoped to `sceneId IS NULL` — NOT include sceneId in the
  // target at all — or every re-mark silently inserts a duplicate row.
  it("doc-level key (sceneId=null) targets the 5-column doc partial index", async () => {
    const { db, onConflictDoUpdate } = buildInsertDb();
    await upsertEditorialAdviceDecision(
      db,
      PROJECT_ID,
      docLevelKey,
      "resolved",
    );
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const call = onConflictDoUpdate.mock.calls[0]?.[0];
    expect(call?.target).toHaveLength(5);
    expect(call?.set.status).toBe("resolved");
    expect(call?.set.updatedAt).toBeInstanceOf(Date);
  });

  it("scene-level key targets the 6-column scene partial index", async () => {
    const { db, onConflictDoUpdate } = buildInsertDb();
    await upsertEditorialAdviceDecision(db, PROJECT_ID, sceneKey, "approved");
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const call = onConflictDoUpdate.mock.calls[0]?.[0];
    expect(call?.target).toHaveLength(6);
    expect(call?.set.status).toBe("approved");
  });
});
