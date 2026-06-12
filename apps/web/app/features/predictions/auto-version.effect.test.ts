import { describe, it, expect } from "vitest";
import { Effect, Exit, Layer } from "effect";
import { documents, documentVersions } from "@oh-writers/db/schema";
import { DocumentTypes } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { DbService } from "~/server/effect";
import {
  applyVersionLiveEffect,
  resolveVersionWriteMode,
  CESARE_VERSION_GROUP_TTL_MS,
} from "./auto-version.effect";

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
  | { kind: "mirrorUpdate"; content: string }
  | {
      kind: "versionUpdate";
      content: string;
      label: string | null;
    }
  | { kind: "deleteVersion"; versionId: string };

/** The working version's turn-group meta served by the currentVersion select
 *  (Spec 75). Absent ⇒ the select resolves no row (no current version). */
interface MockCurrentVersionMeta {
  cesareSessionId: string | null;
  updatedAt: Date;
  content: string;
  label: string | null;
}

interface MockOptions {
  existingVersionContents?: string[];
  currentVersionId?: string | null;
  currentContent?: string;
  currentVersionMeta?: MockCurrentVersionMeta;
  failApply?: boolean;
  /** Reject the FIRST documentVersions update (the overwrite apply) so the
   *  release path's restore can be observed. */
  failOverwrite?: boolean;
}

const makeMockDb = (opts: MockOptions) => {
  const ops: Op[] = [];
  const insertedId = "version-new";

  // select(...) → from(table) → where(...) [→ limit(1)] resolves to an array.
  const select = (columns: Record<string, unknown>) => {
    const build = (table: unknown) => {
      const resolveRows = (): unknown[] => {
        // Spec 75 — the currentVersion turn-group meta select (carries
        // cesareSessionId); must be matched BEFORE the contents select since
        // both ask for `content`.
        if (table === documentVersions && "cesareSessionId" in columns) {
          return opts.currentVersionMeta ? [opts.currentVersionMeta] : [];
        }
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

  let versionUpdateCount = 0;
  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        // Spec 75 — overwrite mode rewrites the working version row in place
        // (apply: new content + refreshed label; release: prior content+label).
        if (table === documentVersions) {
          versionUpdateCount += 1;
          ops.push({
            kind: "versionUpdate",
            content: values["content"] as string,
            label: (values["label"] as string | null) ?? null,
          });
          if (opts.failOverwrite && versionUpdateCount === 1) {
            return Promise.reject(new Error("forced overwrite failure"));
          }
          return Promise.resolve();
        }
        if (table === documents) {
          if (!("currentVersionId" in values)) {
            // Overwrite mode mirrors the content on the document row without
            // touching the pointer (apply and release both land here).
            ops.push({
              kind: "mirrorUpdate",
              content: values["content"] as string,
            });
            return Promise.resolve();
          }
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

// ─── Spec 75 (BUG-N66) — turn-group policy ────────────────────────────────────

const SESSION_A = "00000000-0000-4000-a000-0000000000aa";
const SESSION_B = "00000000-0000-4000-a000-0000000000bb";
const NOW = new Date("2026-06-11T12:00:00.000Z");

// Fresh relative to REAL time: applyVersionLiveEffect resolves the mode with
// `new Date()`, so the fixture must sit inside the TTL window at run time. The
// pure resolveVersionWriteMode tests pass `NOW` explicitly where age matters.
const freshMeta = (overrides: Partial<MockCurrentVersionMeta> = {}) => ({
  cesareSessionId: SESSION_A,
  updatedAt: new Date(Date.now() - 60_000),
  content: PREV,
  label: "Cesare · soggetto (vecchia istruzione)",
  ...overrides,
});

describe("[OHW-075] resolveVersionWriteMode — the turn-group decision", () => {
  it("same session + fresh + overwrite intent → overwrite", () => {
    expect(
      resolveVersionWriteMode("overwrite", SESSION_A, freshMeta(), NOW),
    ).toBe("overwrite");
  });

  it("intent 'new' forces insert even inside a live group (explicit user request)", () => {
    expect(resolveVersionWriteMode("new", SESSION_A, freshMeta(), NOW)).toBe(
      "insert",
    );
  });

  it("no session id → insert (defensive fallback, pre-N66 behaviour)", () => {
    expect(resolveVersionWriteMode("overwrite", null, freshMeta(), NOW)).toBe(
      "insert",
    );
  });

  it("no current version → insert (first write)", () => {
    expect(resolveVersionWriteMode("overwrite", SESSION_A, null, NOW)).toBe(
      "insert",
    );
  });

  it("current version belongs to another session (or to the user) → insert", () => {
    expect(
      resolveVersionWriteMode(
        "overwrite",
        SESSION_A,
        freshMeta({ cesareSessionId: SESSION_B }),
        NOW,
      ),
    ).toBe("insert");
    expect(
      resolveVersionWriteMode(
        "overwrite",
        SESSION_A,
        freshMeta({ cesareSessionId: null }),
        NOW,
      ),
    ).toBe("insert");
  });

  it("stale working version (≥ 30 min) → insert; just inside the TTL → overwrite", () => {
    const stale = freshMeta({
      updatedAt: new Date(NOW.getTime() - CESARE_VERSION_GROUP_TTL_MS),
    });
    expect(resolveVersionWriteMode("overwrite", SESSION_A, stale, NOW)).toBe(
      "insert",
    );
    const justFresh = freshMeta({
      updatedAt: new Date(NOW.getTime() - CESARE_VERSION_GROUP_TTL_MS + 1),
    });
    expect(
      resolveVersionWriteMode("overwrite", SESSION_A, justFresh, NOW),
    ).toBe("overwrite");
  });
});

describe("[OHW-075] applyVersionLiveEffect — overwrite mode (same-session group)", () => {
  const overwriteOptions = {
    cesareSessionId: SESSION_A,
    intent: "overwrite" as const,
  };

  it("overwrites the working version in place: no insert, label refreshed, content mirrored", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-working",
      currentContent: PREV,
      currentVersionMeta: freshMeta(),
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "Cesare · soggetto (più asciutto)",
          overwriteOptions,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const kinds = mock.ops.map((o) => o.kind);
    // No new version row, no pointer repoint — the row is rewritten in place
    // and the document content mirrored.
    expect(kinds).not.toContain("insertVersion");
    expect(kinds).not.toContain("applyUpdate");
    expect(kinds).toContain("versionUpdate");
    expect(kinds).toContain("mirrorUpdate");
    const versionUpdate = mock.ops.find((o) => o.kind === "versionUpdate");
    expect(versionUpdate).toMatchObject({
      content: NEXT,
      label: "Cesare · soggetto (più asciutto)",
    });
    if (Exit.isSuccess(exit)) {
      expect(exit.value.writeMode).toBe("overwrite");
      expect(exit.value.versionId).toBe("version-working");
      // No per-turn revert target on overwrite turns (Spec 75).
      expect(exit.value.previousVersionId).toBe(null);
      // The diff is computed against the working version's prior content.
      const opsKinds = exit.value.diffSegments.map((s) => s.op);
      expect(opsKinds).toContain("add");
      expect(opsKinds).toContain("del");
    }
  });

  it("explicit intent 'new' inside a live group inserts a session-stamped version (group continues on it)", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-working",
      currentContent: PREV,
      currentVersionMeta: freshMeta(),
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "v2 più cupa",
          { cesareSessionId: SESSION_A, intent: "new" },
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const kinds = mock.ops.map((o) => o.kind);
    expect(kinds).toContain("insertVersion");
    expect(kinds).toContain("applyUpdate");
    expect(kinds).not.toContain("versionUpdate");
    if (Exit.isSuccess(exit)) {
      expect(exit.value.writeMode).toBe("insert");
      expect(exit.value.previousVersionId).toBe("version-working");
    }
  });

  it("duplicate guard (overwrite mode): rejects only a true no-op against the working version itself", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-working",
      currentContent: PREV,
      currentVersionMeta: freshMeta({ content: NEXT }),
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "Cesare · soggetto",
          overwriteOptions,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(mock.ops).toHaveLength(0);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("identico a una versione esistente");
    }
  });

  it("duplicate guard (overwrite mode): content matching ANOTHER version is allowed (return to pre-group text)", async () => {
    const mock = makeMockDb({
      // The checkpoint version holds NEXT — the model may legitimately go back
      // to it; only the working version's own content is a no-op.
      existingVersionContents: [NEXT],
      currentVersionId: "version-working",
      currentContent: PREV,
      currentVersionMeta: freshMeta(),
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "Cesare · soggetto",
          overwriteOptions,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(mock.ops.map((o) => o.kind)).toContain("versionUpdate");
  });

  it("forced overwrite failure → release restores the working version's prior content + label", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-working",
      currentContent: PREV,
      currentVersionMeta: freshMeta(),
      failOverwrite: true,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "Cesare · soggetto (più asciutto)",
          overwriteOptions,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const versionUpdates = mock.ops.filter((o) => o.kind === "versionUpdate");
    // First update is the failed apply (new content), second is the release
    // restoring the prior content + label.
    expect(versionUpdates).toHaveLength(2);
    expect(versionUpdates[0]).toMatchObject({ content: NEXT });
    expect(versionUpdates[1]).toMatchObject({
      content: PREV,
      label: "Cesare · soggetto (vecchia istruzione)",
    });
    // The document content is restored too; the pointer was never touched.
    const mirrors = mock.ops.filter((o) => o.kind === "mirrorUpdate");
    expect(mirrors.at(-1)).toMatchObject({ content: PREV });
    expect(mock.ops.map((o) => o.kind)).not.toContain("deleteVersion");
  });

  it("empty-content guard intact under overwrite options (fail fast, no DB write)", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-working",
      currentContent: PREV,
      currentVersionMeta: freshMeta(),
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          "   ",
          "Cesare · soggetto",
          overwriteOptions,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(mock.ops).toHaveLength(0);
  });
});
