import { describe, it, expect } from "vitest";
import { Effect, Exit, Layer } from "effect";
import { documents, documentVersions } from "@oh-writers/db/schema";
import { DocumentTypes } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { DbService } from "~/server/effect";
import { applyVersionLiveEffect } from "./auto-version.effect";

// ─── Mock Db ─────────────────────────────────────────────────────────────────
//
// A minimal Drizzle-shaped fake that records the ORDER of operations so the test
// can prove the `acquireRelease` contract: the version is INSERTED (acquire)
// before the document is UPDATED (use/apply), and on a forced apply failure the
// compensating revert + delete (release) run. No real DB, so the test isolates
// the Effect semantics from Postgres' own transaction rollback.

type Op =
  | { kind: "insertVersion"; content: string }
  | { kind: "applyUpdate"; versionId: string; content: string }
  | { kind: "revertUpdate"; versionId: string | null; content: string }
  | { kind: "deleteVersion"; versionId: string };

interface MockOptions {
  existingVersionContents?: string[];
  currentVersionId?: string | null;
  currentContent?: string;
  failApply?: boolean;
}

const makeMockDb = (opts: MockOptions) => {
  const ops: Op[] = [];
  const insertedId = "version-new";

  // select(...) → from(table) → where(...) [→ limit(1)] resolves to an array.
  const select = (columns: Record<string, unknown>) => {
    const build = (table: unknown) => {
      const resolveRows = (): unknown[] => {
        if (table === documentVersions && "content" in columns) {
          return (opts.existingVersionContents ?? []).map((content) => ({
            content,
          }));
        }
        if (table === documents) {
          return [
            {
              currentVersionId: opts.currentVersionId ?? null,
              content: opts.currentContent ?? "",
            },
          ];
        }
        if (table === documentVersions && "max" in columns) {
          return [{ max: (opts.existingVersionContents ?? []).length }];
        }
        return [];
      };
      const whereResult = {
        // maxRow / existing-versions selects await the where() directly…
        then: (resolve: (rows: unknown[]) => void) => resolve(resolveRows()),
        // …docRow selects chain .limit(1) before awaiting.
        limit: () => Promise.resolve(resolveRows()),
      };
      return { where: () => whereResult };
    };
    return { from: build };
  };

  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === documents) {
          const versionId = values["currentVersionId"] as string | null;
          const content = values["content"] as string;
          // The apply points at the freshly inserted version; the rollback
          // points back at the previous one (or null).
          if (versionId === insertedId) {
            if (opts.failApply) {
              ops.push({ kind: "applyUpdate", versionId, content });
              return Promise.reject(new Error("forced apply failure"));
            }
            ops.push({ kind: "applyUpdate", versionId, content });
          } else {
            ops.push({ kind: "revertUpdate", versionId, content });
          }
        }
        return Promise.resolve();
      },
    }),
  });

  const del = () => ({
    where: () => {
      ops.push({ kind: "deleteVersion", versionId: insertedId });
      return Promise.resolve();
    },
  });

  // insert records its op so the acquire/use ordering is captured precisely.
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      returning: () => {
        ops.push({ kind: "insertVersion", content: v["content"] as string });
        return Promise.resolve([{ id: insertedId }]);
      },
    }),
  });

  const db = {
    select,
    insert,
    update,
    delete: del,
  } as unknown as Db;

  return {
    layer: Layer.succeed(DbService, { db }),
    ops,
  };
};

const PREV = "Il vecchio soggetto, lungo e prolisso, con molte parole.";
const NEXT = "Il nuovo soggetto asciutto.";

describe("[OHW-048] auto-version acquireRelease — version-before-apply", () => {
  it("inserts the version (acquire) BEFORE applying it to the document (use)", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-prev",
      currentContent: PREV,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "draft Cesare · soggetto",
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const kinds = mock.ops.map((o) => o.kind);
    const insertIdx = kinds.indexOf("insertVersion");
    const applyIdx = kinds.indexOf("applyUpdate");
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(applyIdx).toBeGreaterThan(insertIdx);
    // No rollback on the success path.
    expect(kinds).not.toContain("revertUpdate");
    expect(kinds).not.toContain("deleteVersion");
  });

  it("success path is unchanged: returns the draft with previousVersionId + word diff segments", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-prev",
      currentContent: PREV,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "draft Cesare · soggetto",
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      const draft = exit.value;
      expect(draft.versionId).toBe("version-new");
      expect(draft.previousVersionId).toBe("version-prev");
      expect(draft.documentType).toBe(DocumentTypes.SOGGETTO);
      // Spec 47d: the word-level diff MUST survive the Effect refactor.
      expect(draft.diffSegments.length).toBeGreaterThan(0);
      const ops = draft.diffSegments.map((s) => s.op);
      expect(ops).toContain("add");
      expect(ops).toContain("del");
    }
  });

  // [OHW-audit-F-versions] F-M3: a first generation (no prior content) must
  // still surface what Cesare wrote — the whole new content renders as additions
  // (green), never an empty flash.
  it("no previous content → whole new content as additions (first write)", async () => {
    const mock = makeMockDb({ currentVersionId: null, currentContent: "" });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "draft Cesare · soggetto",
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.previousVersionId).toBe(null);
      const segments = exit.value.diffSegments;
      expect(segments.length).toBeGreaterThan(0);
      // Every segment is an addition: nothing was removed and nothing pre-existed.
      expect(segments.every((s) => s.op === "add")).toBe(true);
      expect(segments.map((s) => s.text).join("")).toBe(NEXT);
    }
  });
});

describe("[OHW-048] auto-version acquireRelease — rollback on apply failure", () => {
  it("forced apply failure → release runs: revert document + delete the version, and the Effect fails", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-prev",
      currentContent: PREV,
      failApply: true,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "draft Cesare · soggetto",
        ),
        mock.layer,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const kinds = mock.ops.map((o) => o.kind);
    // acquire ran (version inserted), apply was attempted, THEN release
    // compensated: the document pointer was reverted and the version deleted.
    expect(kinds).toContain("insertVersion");
    expect(kinds).toContain("applyUpdate");
    expect(kinds).toContain("revertUpdate");
    expect(kinds).toContain("deleteVersion");
    // Release runs AFTER the failed apply.
    expect(kinds.indexOf("revertUpdate")).toBeGreaterThan(
      kinds.indexOf("applyUpdate"),
    );
    // The revert points the document back at the previous version + content.
    const revert = mock.ops.find((o) => o.kind === "revertUpdate");
    expect(revert).toMatchObject({ versionId: "version-prev", content: PREV });
  });
});

describe("[OHW-048] auto-version acquireRelease — guards preserved", () => {
  it("rejects empty content before any DB write (fail fast)", async () => {
    const mock = makeMockDb({ currentVersionId: null, currentContent: "" });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          "   ",
          "draft Cesare · soggetto",
        ),
        mock.layer,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(mock.ops).toHaveLength(0);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause;
      expect(String(failure)).toContain("contenuto vuoto");
    }
  });

  it("rejects content identical to an existing version (duplicate guard)", async () => {
    const mock = makeMockDb({
      existingVersionContents: [NEXT],
      currentVersionId: "version-prev",
      currentContent: PREV,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "draft Cesare · soggetto",
        ),
        mock.layer,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    // Duplicate detected during acquire → nothing inserted, nothing applied.
    expect(mock.ops.map((o) => o.kind)).not.toContain("insertVersion");
    expect(mock.ops.map((o) => o.kind)).not.toContain("applyUpdate");
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("identico a una versione esistente");
    }
  });
});
