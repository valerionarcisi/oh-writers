import { describe, it, expect } from "vitest";
import { Effect, Exit, Layer } from "effect";
import {
  cesareSessions,
  documents,
  documentVersions,
} from "@oh-writers/db/schema";
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
  | {
      kind: "insertVersion";
      content: string;
      versionKind: string;
      cesareSessionId: string | null;
    }
  | {
      kind: "applyUpdate";
      versionId: string;
      content: string;
      reseededCrdt: boolean;
      crdtIsNull: boolean;
    }
  | { kind: "updateWorking"; versionId: string; content: string }
  | {
      kind: "revertUpdate";
      versionId: string | null;
      content: string;
      reseededCrdt: boolean;
      crdtIsNull: boolean;
    }
  | { kind: "restoreWorking"; versionId: string; content: string }
  | { kind: "deleteVersion"; versionId: string };

interface MockOptions {
  existingVersionContents?: string[];
  currentVersionId?: string | null;
  currentContent?: string;
  failApply?: boolean;
  // OHW-N66: drives the overwrite/checkpoint paths. When set, the doc-version
  // select filtered by (kind=working, cesareSessionId) returns this working row,
  // so `acquireVersion` takes the in-place overwrite branch.
  sessionWorkingRow?: { id: string; content: string } | null;
  // BUG #42: when false, the resolveSessionId existence probe returns no row, so
  // a stale/synthetic session id must be written as null (FK-safe), not crash.
  sessionExists?: boolean;
}

const makeMockDb = (opts: MockOptions) => {
  const ops: Op[] = [];
  const insertedId = "version-new";

  // select(...) → from(table) → where(...) [→ orderBy(...)] [→ limit(1)] → array.
  const select = (columns: Record<string, unknown>) => {
    const build = (table: unknown) => {
      const resolveRows = (): unknown[] => {
        // `resolveRows` serves the awaited-`.where()` and `.limit()` chains. The
        // session-working probe is NOT here — it chains `.orderBy().limit()` and
        // is served by `sessionWorkingRows` below, so the duplicate-guard select
        // (also {id, content}, but awaited directly) keeps returning all rows.
        if (table === documents) {
          return [
            {
              currentVersionId: opts.currentVersionId ?? null,
              content: opts.currentContent ?? "",
            },
          ];
        }
        // resolveSessionId existence probe (BUG #42). Defaults to "exists" so
        // every existing test keeps its session id; sessionExists:false models a
        // stale/synthetic id that must resolve to null instead of crashing.
        if (table === cesareSessions) {
          return opts.sessionExists === false ? [] : [{ id: "session-row" }];
        }
        if (table === documentVersions && "max" in columns) {
          return [{ max: (opts.existingVersionContents ?? []).length }];
        }
        // existing-versions (duplicate guard): {id, content} per existing row.
        if (table === documentVersions && "content" in columns) {
          return (opts.existingVersionContents ?? []).map((content, i) => ({
            id: `existing-${i}`,
            content,
          }));
        }
        return [];
      };
      const sessionWorkingRows = (): unknown[] => {
        const row = opts.sessionWorkingRow;
        return row ? [{ id: row.id, content: row.content }] : [];
      };
      const whereResult = {
        // maxRow / existing-versions selects await the where() directly…
        then: (resolve: (rows: unknown[]) => void) => resolve(resolveRows()),
        // …docRow selects chain .limit(1) before awaiting.
        limit: () => Promise.resolve(resolveRows()),
        // …the session-working probe chains orderBy → limit.
        orderBy: () => ({
          limit: () => Promise.resolve(sessionWorkingRows()),
        }),
      };
      return { where: () => whereResult };
    };
    return { from: build };
  };

  const workingId = opts.sessionWorkingRow?.id ?? "version-working";
  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === documents) {
          const versionId = values["currentVersionId"] as string | null;
          const content = values["content"] as string;
          // `yjsState` is written for every PM-room doc type. Its VALUE is the
          // new CRDT, or null when the content has no canonical encoding — that
          // null must still be written, or the room keeps serving the old
          // document while `content` holds the new one (#54).
          const reseededCrdt = "yjsState" in values;
          const crdtIsNull = values["yjsState"] === null;
          // The apply points at the target version (minted OR the working row);
          // the rollback points back at the previous one (or null).
          const isApply = versionId === insertedId || versionId === workingId;
          if (isApply) {
            ops.push({
              kind: "applyUpdate",
              versionId: versionId!,
              content,
              reseededCrdt,
              crdtIsNull,
            });
            if (opts.failApply) {
              return Promise.reject(new Error("forced apply failure"));
            }
          } else {
            ops.push({
              kind: "revertUpdate",
              versionId,
              content,
              reseededCrdt,
              crdtIsNull,
            });
          }
        }
        if (table === documentVersions) {
          const content = values["content"] as string;
          // acquireVersion.updateWorking carries a label; rollback.restoreWorking
          // does not — that is how the two version-row updates are told apart.
          const kind = "label" in values ? "updateWorking" : "restoreWorking";
          ops.push({ kind, versionId: workingId, content });
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

  // insert records its op (with the version `kind`) so the acquire/use ordering
  // AND the checkpoint-before-working sequence are captured precisely.
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      returning: () => {
        const versionKind = (v["kind"] as string) ?? "manual";
        ops.push({
          kind: "insertVersion",
          content: v["content"] as string,
          versionKind,
          cesareSessionId: (v["cesareSessionId"] as string | null) ?? null,
        });
        // A minted checkpoint is a distinct row from the working row that follows.
        const id =
          versionKind === "checkpoint" ? "version-checkpoint" : insertedId;
        return Promise.resolve([{ id }]);
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

// A long base + a one-word tweak → classifyEditSize → "small" → overwrite.
const LONG_BASE =
  "Marco torna nel paese natale dopo vent'anni di assenza per il funerale del " +
  "padre con cui non parlava da tempo e ritrova la sorella minore Elena rimasta " +
  "a occuparsi della vecchia casa di famiglia ormai in rovina tra ricordi e " +
  "rancori mai sopiti che riaffiorano lentamente giorno dopo giorno.";
const SMALL_EDIT =
  "Marco torna nel paese natale dopo vent'anni di assenza per il funerale del " +
  "padre con cui non parlava da tempo e ritrova la sorella maggiore Elena rimasta " +
  "a occuparsi della vecchia casa di famiglia ormai in rovina tra ricordi e " +
  "rancori mai sopiti che riaffiorano lentamente giorno dopo giorno.";

const SESSION = "cesare-session-1";
const overwriteOpts = {
  sessionId: SESSION,
  userRequestedNewVersion: false,
  largeEditConfirmed: false,
};

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

describe("[OHW-N66] overwrite — small edit, working row exists", () => {
  it("updates the working row IN PLACE: no new version row, no checkpoint mint", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-working",
      currentContent: LONG_BASE,
      sessionWorkingRow: { id: "version-working", content: LONG_BASE },
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          SMALL_EDIT,
          "draft Cesare · soggetto",
          overwriteOpts,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const kinds = mock.ops.map((o) => o.kind);
    // The flood killer: a small edit overwrites the existing row — no INSERT.
    expect(kinds).toContain("updateWorking");
    expect(kinds).not.toContain("insertVersion");
    if (Exit.isSuccess(exit)) {
      // The edit still targets the working row (not a freshly minted one).
      expect(exit.value.versionId).toBe("version-working");
    }
  });
});

describe("[OHW-N66] overwrite — first edit of a session mints a checkpoint", () => {
  it("snapshots the pre-session content as a `checkpoint`, then seeds a `working` row", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-prev",
      currentContent: LONG_BASE,
      sessionWorkingRow: null, // no working row yet → first overwrite of the session
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          SMALL_EDIT,
          "draft Cesare · soggetto",
          overwriteOpts,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const inserts = mock.ops.filter(
      (o) => o.kind === "insertVersion",
    ) as Array<{
      versionKind: string;
      content: string;
    }>;
    // Two inserts: the pre-session checkpoint FIRST, then the working seed.
    expect(inserts.map((i) => i.versionKind)).toEqual([
      "checkpoint",
      "working",
    ]);
    // The checkpoint captures the pre-session content (what rollback returns to).
    expect(inserts[0]?.content).toBe(LONG_BASE);
    expect(inserts[1]?.content).toBe(SMALL_EDIT);
  });
});

describe("[OHW-N66] overwrite — rollback restores the working row on failure", () => {
  it("forced apply failure → release restores the working row's prior content (not delete)", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-working",
      currentContent: LONG_BASE,
      sessionWorkingRow: { id: "version-working", content: LONG_BASE },
      failApply: true,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          SMALL_EDIT,
          "draft Cesare · soggetto",
          overwriteOpts,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const kinds = mock.ops.map((o) => o.kind);
    // On an overwrite, release restores the working row's PRIOR content — it does
    // NOT delete a row the session still owns.
    expect(kinds).toContain("restoreWorking");
    expect(kinds).not.toContain("deleteVersion");
    const restore = mock.ops.find((o) => o.kind === "restoreWorking");
    expect(restore).toMatchObject({
      versionId: "version-working",
      content: LONG_BASE,
    });
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

describe("[OHW-N72] Cesare narrative apply reseeds the CRDT", () => {
  it("PM-room doc type (soggetto) → applyUpdate reseeds yjs_state from the new content", async () => {
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
    const apply = mock.ops.find((o) => o.kind === "applyUpdate");
    expect(apply).toMatchObject({ reseededCrdt: true });
  });

  it("non-PM-room doc type (logline) → applyUpdate does NOT touch yjs_state", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-prev",
      currentContent: PREV,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.LOGLINE,
          "user-1",
          NEXT,
          "draft Cesare · logline",
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const apply = mock.ops.find((o) => o.kind === "applyUpdate");
    expect(apply).toMatchObject({ reseededCrdt: false });
  });

  // #54 — content the canonical parser does not recognise has no CRDT encoding.
  // Skipping the column then left the room serving the WHOLE previous document
  // while `content` held the new one, and since the editor renders the CRDT the
  // writer kept seeing the old text — its tail past the new content being exactly
  // the "AAAAAA/bbbbb" leftover that was reported. The null must be WRITTEN: a
  // NULL state loads as an empty fragment, which the client reseeds from
  // `content`, so it cannot wipe the room.
  it("PM-room doc with non-canonical HTML → yjs_state is written as NULL, not skipped", async () => {
    const NON_CANONICAL =
      "<div class='x'>testo che il parser non riconosce</div>";
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
          NON_CANONICAL,
          "draft Cesare · soggetto",
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const apply = mock.ops.find((o) => o.kind === "applyUpdate");
    expect(apply).toMatchObject({ reseededCrdt: true, crdtIsNull: true });
  });

  it("rollback on failure reseeds the CRDT back to the previous content", async () => {
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
    const revert = mock.ops.find((o) => o.kind === "revertUpdate");
    expect(revert).toMatchObject({ content: PREV, reseededCrdt: true });
  });
});

describe("[OHW-N42] stale/synthetic session id is FK-safe (does not crash the apply)", () => {
  it("a sessionId that no longer exists is written as null, the version still commits", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-prev",
      currentContent: PREV,
      // The session id in overwriteOpts is gone from cesare_sessions → the
      // existence probe returns no row.
      sessionExists: false,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "draft Cesare · soggetto",
          overwriteOpts,
        ),
        mock.layer,
      ),
    );
    // The apply succeeds (no FK crash) …
    expect(Exit.isSuccess(exit)).toBe(true);
    // … and every inserted version row carries a null session id, never the
    // stale one.
    const inserts = mock.ops.filter((o) => o.kind === "insertVersion");
    expect(inserts.length).toBeGreaterThan(0);
    for (const ins of inserts) {
      expect(ins).toMatchObject({ cesareSessionId: null });
    }
  });

  it("a live sessionId is preserved on the inserted version row", async () => {
    const mock = makeMockDb({
      currentVersionId: "version-prev",
      currentContent: PREV,
      sessionExists: true,
    });
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        applyVersionLiveEffect(
          "doc-1",
          DocumentTypes.SOGGETTO,
          "user-1",
          NEXT,
          "draft Cesare · soggetto",
          overwriteOpts,
        ),
        mock.layer,
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    const inserts = mock.ops.filter((o) => o.kind === "insertVersion");
    expect(inserts.length).toBeGreaterThan(0);
    expect(inserts.some((i) => i.cesareSessionId === SESSION)).toBe(true);
  });
});
