import { Cause, Effect, Exit, Layer } from "effect";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  cesareSessions,
  documents,
  documentVersions,
} from "@oh-writers/db/schema";
import { type DocumentType } from "@oh-writers/domain";
import { buildWordDiffSegments } from "@oh-writers/utils";
import { okAsync, ResultAsync } from "neverthrow";
import type { Db } from "~/server/db";
import { DbService, toResultAsync } from "~/server/effect";
import {
  isPmRoomDocType,
  yjsStateFromNarrativeContent,
} from "~/features/documents/server/yjs-seed.server";
import { notifyRoomReseed } from "~/features/realtime/server/notify-room-reseed";
import { CesareError } from "./cesare.errors";
import { resolveVersionAction } from "./resolve-version-action";
import { changedWordRatio } from "./classify-edit-size";

// BUG-N66 / Spec 76 — how a Cesare edit is committed to the version history.
// Omitting `options` (or passing none) preserves the legacy behaviour: always
// mint a new `manual` version, so every existing caller is untouched until it
// opts in by passing a `sessionId`.
export interface CommitOptions {
  /** The Cesare session this edit belongs to. Required to collapse a session's
   *  working edits into one row instead of flooding the list. */
  readonly sessionId: string | null;
  /** The user explicitly asked for a new version ("fanne una nuova versione"). */
  readonly userRequestedNewVersion: boolean;
  /** A prior turn asked and the user chose "Nuova versione"; this is the apply. */
  readonly largeEditConfirmed: boolean;
  /** A prior turn asked and the user chose "Sovrascrivi"; apply the large edit in
   *  place rather than minting. Defaults to false. */
  readonly largeEditOverwriteConfirmed?: boolean;
}

const LEGACY_MINT: CommitOptions = {
  sessionId: null,
  userRequestedNewVersion: true, // force mint — preserves pre-Spec-76 behaviour
  largeEditConfirmed: false,
};

// ─── Auto-versioning as `acquireRelease` (Spec 48 W-E4) ──────────────────────────
//
// The canonical Agentic Edit Pattern (CLAUDE.md): for every Cesare edit a version
// is ALWAYS auto-created BEFORE the change is applied, and on error the apply
// rolls back so the document is never left half-applied.
//
// Here that invariant is made EXPLICIT and impossible to forget with Effect's
// `acquireRelease`/`Scope`, so any future tool that mutates an entity inherits it
// for free instead of hand-rolling the ordering:
//
//   acquire  → create the version: capture the "before" snapshot
//              (`previousVersionId` + `previousContent`) and INSERT the new
//              version row. This is the resource — it exists before any apply.
//   use      → apply live: point the document at the new version and mirror its
//              content, so the open editor updates behind the floating chat.
//   release  → ON FAILURE/INTERRUPTION ONLY, compensate: revert the document
//              pointer + content to the captured "before" and delete the version
//              row, so the document is never left half-applied. No-op on success.
//
// The surrounding `db.transaction` is the real atomicity boundary — a throw rolls
// the whole tx back. The `acquireRelease` wrapper is the documented, testable
// guarantee on top of it: the version is created in `acquire` (before `use`), and
// the compensating revert is bound to the resource's lifecycle, not left to a
// caller to remember. Belt and suspenders, by design.

export interface CreatedDraft {
  versionId: string;
  previousVersionId: string | null;
  documentType: DocumentType;
  label: string;
  diffSegments: ReturnType<typeof buildWordDiffSegments>;
}

// The resource produced by `acquire`: the version row this edit targets plus the
// "before" snapshot needed to (a) build the word diff and (b) compensate on
// failure. `wasOverwrite` tells `release` whether to revert an in-place update of
// an existing working row (true) or delete a freshly-minted row (false).
interface AcquiredVersion {
  versionId: string;
  previousVersionId: string | null;
  previousContent: string;
  // For the overwrite path: the content the target row held BEFORE this edit, so
  // `release` can restore the row itself (not just the document pointer).
  targetPriorContent: string;
  wasOverwrite: boolean;
}

const fail = (cause: string): CesareError => new CesareError(cause);

// Lift a tx-bound DB promise into the Effect failure channel as a `CesareError`,
// preserving the original message (the duplicate/empty-content guards rely on the
// exact Italian copy reaching the user via the ResultShape boundary).
const dbStep = <A>(
  thunk: () => Promise<A>,
  context: string,
): Effect.Effect<A, CesareError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (e) =>
      fail(e instanceof Error ? e.message : `${context}: ${String(e)}`),
  });

// Defence in depth (BUG #42): the version row carries a FK to cesare_sessions.
// A stale/synthetic session id (a client that sent before its session was
// persisted) would otherwise make the INSERT fail with a foreign-key violation,
// aborting the whole document apply — the editor never updates and Cesare
// falsely reports success. Resolve the id to null when the session does not
// exist, so the version still commits (it just doesn't collapse under that
// session's checkpoint). The primary fix is client-side (always send a real
// session id); this keeps the server from ever crashing an apply on a bad id.
const resolveSessionId = (
  cesareSessionId: string | null,
): Effect.Effect<string | null, CesareError, DbService> =>
  Effect.gen(function* () {
    if (!cesareSessionId) return null;
    const { db } = yield* DbService;
    const [row] = yield* dbStep(
      () =>
        db
          .select({ id: cesareSessions.id })
          .from(cesareSessions)
          .where(eq(cesareSessions.id, cesareSessionId))
          .limit(1),
      "resolveSessionId.exists",
    );
    return row ? cesareSessionId : null;
  });

// Insert a fresh numbered version row. Shared by the mint path and by the
// overwrite path's first-of-session checkpoint + working seeding.
const insertVersionRow = (
  documentId: string,
  createdBy: string,
  content: string,
  label: string,
  kind: "manual" | "checkpoint" | "working",
  cesareSessionId: string | null,
): Effect.Effect<string, CesareError, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const safeSessionId = yield* resolveSessionId(cesareSessionId);
    const [maxRow] = yield* dbStep(
      () =>
        db
          .select({
            max: sql<number>`coalesce(max(${documentVersions.number}), 0)`,
          })
          .from(documentVersions)
          .where(eq(documentVersions.documentId, documentId)),
      "insertVersionRow.maxRow",
    );
    const nextNum = (maxRow?.max ?? 0) + 1;
    const [inserted] = yield* dbStep(
      () =>
        db
          .insert(documentVersions)
          .values({
            documentId,
            number: nextNum,
            label,
            content,
            kind,
            cesareSessionId: safeSessionId,
            isDraft: false,
            createdBy,
          })
          .returning({ id: documentVersions.id }),
      "insertVersionRow.insert",
    );
    if (!inserted) {
      return yield* Effect.fail(fail("applyVersionLive returned no rows"));
    }
    return inserted.id;
  });

// acquire: resolve the version action (Spec 76) and create/select the target row
// BEFORE any apply. Empty-content and duplicate guards run first (fail fast).
//   mint      → insert a new `manual` row (legacy behaviour).
//   overwrite → reuse this session's `working` row (in place); if none exists,
//               first checkpoint the pre-session state, then seed a `working` row.
const acquireVersion = (
  documentId: string,
  createdBy: string,
  content: string,
  label: string,
  options: CommitOptions,
): Effect.Effect<AcquiredVersion, CesareError, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const trimmed = content.trim();
    if (!trimmed) {
      return yield* Effect.fail(
        fail("Il modello ha restituito un contenuto vuoto."),
      );
    }

    const [docRow] = yield* dbStep(
      () =>
        db
          .select({
            currentVersionId: documents.currentVersionId,
            content: documents.content,
          })
          .from(documents)
          .where(eq(documents.id, documentId))
          .limit(1),
      "acquireVersion.docRow",
    );
    const previousVersionId = docRow?.currentVersionId ?? null;
    const previousContent = docRow?.content ?? "";

    // Find this session's existing working row (the overwrite target), if any.
    const sessionId = options.sessionId;
    const sessionWorking = sessionId
      ? yield* dbStep(
          () =>
            db
              .select({
                id: documentVersions.id,
                content: documentVersions.content,
              })
              .from(documentVersions)
              .where(
                and(
                  eq(documentVersions.documentId, documentId),
                  eq(documentVersions.kind, "working"),
                  eq(documentVersions.cesareSessionId, sessionId),
                ),
              )
              .orderBy(desc(documentVersions.number))
              .limit(1),
          "acquireVersion.sessionWorking",
        )
      : [];
    const workingRow = sessionWorking[0] ?? null;

    // Spec 76: the `ask` is resolved one level up in `commitOrAsk` (the tool
    // boundary, where the step-event sink lives), so by the time the engine runs
    // the action is only overwrite or mint. An `ask` reaching here can only mean
    // a caller bypassed the boundary; treat it as mint (safe — it still versions).
    const action = resolveVersionAction({
      previousContent,
      nextContent: content,
      userRequestedNewVersion: options.userRequestedNewVersion,
      largeEditConfirmed: options.largeEditConfirmed,
      largeEditOverwriteConfirmed: options.largeEditOverwriteConfirmed ?? false,
    });
    const wantsOverwrite = action === "overwrite";

    // Duplicate-content guard. Exclude the overwrite target (re-applying the same
    // text to the row we are about to replace is not a "duplicate version").
    const existing = yield* dbStep(
      () =>
        db
          .select({
            id: documentVersions.id,
            content: documentVersions.content,
          })
          .from(documentVersions)
          .where(eq(documentVersions.documentId, documentId)),
      "acquireVersion.existing",
    );
    const duplicate = existing.some(
      (e) =>
        e.content.trim() === trimmed &&
        !(wantsOverwrite && workingRow && e.id === workingRow.id),
    );
    if (duplicate) {
      return yield* Effect.fail(
        fail(
          "Il modello ha restituito un testo identico a una versione esistente. Riformula la richiesta con un'istruzione più specifica (tono, struttura, lunghezza).",
        ),
      );
    }

    // ── MINT (or ask→mint in Slice 1) ──────────────────────────────────────────
    if (!wantsOverwrite) {
      const versionId = yield* insertVersionRow(
        documentId,
        createdBy,
        content,
        label,
        "manual",
        options.sessionId,
      );
      return {
        versionId,
        previousVersionId,
        previousContent,
        targetPriorContent: "",
        wasOverwrite: false,
      };
    }

    // ── OVERWRITE ──────────────────────────────────────────────────────────────
    if (workingRow) {
      // Reuse this session's working row: update it in place. No number bump,
      // no new row — this is what kills the flood.
      const targetPriorContent = workingRow.content;
      yield* dbStep(
        () =>
          db
            .update(documentVersions)
            .set({ content, label, updatedAt: new Date() })
            .where(eq(documentVersions.id, workingRow.id)),
        "acquireVersion.updateWorking",
      );
      return {
        versionId: workingRow.id,
        previousVersionId,
        previousContent,
        targetPriorContent,
        wasOverwrite: true,
      };
    }

    // First overwrite of this session: snapshot the pre-session state as a
    // `checkpoint` (what rollback returns to), then seed a `working` row that
    // subsequent overwrites collect into.
    if (previousContent.trim()) {
      yield* insertVersionRow(
        documentId,
        createdBy,
        previousContent,
        `${label} · checkpoint`,
        "checkpoint",
        options.sessionId,
      );
    }
    const versionId = yield* insertVersionRow(
      documentId,
      createdBy,
      content,
      label,
      "working",
      options.sessionId,
    );
    return {
      versionId,
      previousVersionId,
      previousContent,
      targetPriorContent: "",
      wasOverwrite: false,
    };
  });

// use: apply live — point the document at the new version and mirror its content
// so the open editor reflects it behind the floating chat. For PM-room doc types
// (soggetto/synopsis/treatment) the realtime editor reads the CRDT, not
// `content`, so the Yjs state is reseeded from the new content too — otherwise
// the open/reloaded editor keeps the pre-edit text (BUG-N72, the narrative twin
// of the screenplay BUG-N71 reseed). `yjsStateFromNarrativeContent` returns null
// for empty/HTML content; in that case the existing CRDT is left untouched
// (nulling it would wipe the room), the same guard the seed path uses.
const applyLive = (
  documentId: string,
  documentType: DocumentType,
  acquired: AcquiredVersion,
  content: string,
): Effect.Effect<void, CesareError, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const reseed = isPmRoomDocType(documentType)
      ? yjsStateFromNarrativeContent(content)
      : null;
    yield* dbStep(
      () =>
        db
          .update(documents)
          .set({
            currentVersionId: acquired.versionId,
            content,
            ...(reseed ? { yjsState: reseed } : {}),
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId)),
      "applyLive.update",
    );
  });

// release (failure path only): revert the document pointer + content to the
// captured "before" and delete the version row, so a failed apply never leaves a
// half-applied document. Best-effort — the outer tx rollback is the hard
// guarantee; this is the explicit, observable compensation.
const rollbackApply = (
  documentId: string,
  documentType: DocumentType,
  acquired: AcquiredVersion,
): Effect.Effect<void, never, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    // Reseed the CRDT back to the "before" content too, so a failed apply never
    // leaves the room on the half-applied edit while `content` reverts (BUG-N72).
    const reseed = isPmRoomDocType(documentType)
      ? yjsStateFromNarrativeContent(acquired.previousContent)
      : null;
    yield* Effect.ignore(
      dbStep(
        () =>
          db
            .update(documents)
            .set({
              currentVersionId: acquired.previousVersionId,
              content: acquired.previousContent,
              ...(reseed ? { yjsState: reseed } : {}),
              updatedAt: new Date(),
            })
            .where(eq(documents.id, documentId)),
        "rollbackApply.revertDocument",
      ),
    );
    // On a mint, the row was freshly created by this edit — delete it. On an
    // overwrite, the working row pre-existed this edit — restore its prior
    // content rather than deleting a row the session still owns.
    if (acquired.wasOverwrite) {
      yield* Effect.ignore(
        dbStep(
          () =>
            db
              .update(documentVersions)
              .set({
                content: acquired.targetPriorContent,
                updatedAt: new Date(),
              })
              .where(eq(documentVersions.id, acquired.versionId)),
          "rollbackApply.restoreWorking",
        ),
      );
    } else {
      yield* Effect.ignore(
        dbStep(
          () =>
            db
              .delete(documentVersions)
              .where(eq(documentVersions.id, acquired.versionId)),
          "rollbackApply.deleteVersion",
        ),
      );
    }
  });

/**
 * The Effect core: version-before-apply with rollback-on-failure, modelled with
 * `acquireRelease`. Depends on `DbService` (the Layer) so the tx handle is
 * injected, never threaded by hand, and so tests can substitute a Db whose apply
 * fails and assert the compensation runs. Returns the {@link CreatedDraft} the
 * neverthrow consumers already expect — including the word-level `diffSegments`
 * the Spec 47d inline live-diff depends on.
 */
export const applyVersionLiveEffect = (
  documentId: string,
  documentType: DocumentType,
  createdBy: string,
  content: string,
  label: string,
  options: CommitOptions = LEGACY_MINT,
): Effect.Effect<CreatedDraft, CesareError, DbService> =>
  Effect.acquireUseRelease(
    acquireVersion(documentId, createdBy, content, label, options),
    (acquired) =>
      applyLive(documentId, documentType, acquired, content).pipe(
        Effect.map(
          (): CreatedDraft => ({
            versionId: acquired.versionId,
            previousVersionId: acquired.previousVersionId,
            documentType,
            label,
            // Word-level diff (previous active content → new content) for the
            // inline "Mostra modifiche" coloured rendering. On a first write the
            // prior content is empty, so we diff `"" → content` to render the
            // whole new document as additions (green) — the user still sees what
            // Cesare wrote on a first generation. MUST survive — Spec 47d.
            diffSegments: buildWordDiffSegments(
              acquired.previousContent.trim() ? acquired.previousContent : "",
              content,
            ),
          }),
        ),
      ),
    (acquired, exit) =>
      Exit.isFailure(exit)
        ? rollbackApply(documentId, documentType, acquired)
        : Effect.void,
  );

/**
 * Auto-creates a version under the hood AND applies it live to the open document
 * (Spec 44 canonical Notion pattern). The version is created BEFORE the apply and
 * the apply rolls back on error — guaranteed by {@link applyVersionLiveEffect}'s
 * `acquireRelease`.
 *
 * Runs inside `db.transaction` (the real atomicity boundary) and provides the tx
 * handle as the `DbService` Layer, so the Effect consumes Db via the Layer per
 * ADR 48. The Effect result is bridged back to `ResultAsync` so every existing
 * neverthrow caller (`handlePropose*`, `executeDocumentGenTool`) is untouched —
 * the boundary contract stays `ResultAsync<CreatedDraft, CesareError>`.
 */
export const applyVersionLive = (
  db: Db,
  documentId: string,
  documentType: DocumentType,
  createdBy: string,
  content: string,
  label: string,
  options: CommitOptions = LEGACY_MINT,
): ResultAsync<CreatedDraft, CesareError> =>
  runInTransaction(db, (tx) =>
    applyVersionLiveEffect(
      documentId,
      documentType,
      createdBy,
      content,
      label,
      options,
    ).pipe(Effect.provide(Layer.succeed(DbService, { db: tx }))),
  ).map((draft) => {
    // The DB (content + version + reseeded CRDT) is now committed. For a
    // realtime PM-room doc, drop the live ws-server room so connected editors
    // reload the fresh CRDT instead of keeping (and re-persisting) the stale one
    // (BUG-N72). Fire-and-forget — a missing ws-server never affects the apply.
    if (isPmRoomDocType(documentType)) void notifyRoomReseed(documentId);
    return draft;
  });

// ─── Slice 2 (Spec 76): the large-edit ASK ──────────────────────────────────
//
// A large, unconfirmed edit must not silently apply: Cesare asks the writer
// whether to overwrite the current version or mint a new one. The decision is a
// pure function of the same inputs the resolver already takes, so it is resolved
// HERE — at the commit boundary — and surfaced as a distinct outcome rather than
// a `CreatedDraft`. The DB engine (`applyVersionLive`) stays apply-only: nothing
// is written on an ask, so the open document is untouched until the writer picks.

/** The turn produced an ASK instead of an applied edit. Carries what the card
 *  needs: which entity, and how big the change was (for the IT copy). */
export interface AskedNewVersion {
  readonly _tag: "asked";
  readonly documentType: DocumentType;
  readonly changedWordRatio: number;
}

/** Either the edit was applied (draft) or Cesare asked (no write happened). */
export type CommitOutcome = CreatedDraft | AskedNewVersion;

export const isAsked = (o: CommitOutcome): o is AskedNewVersion =>
  "_tag" in o && o._tag === "asked";

/**
 * Commit a Cesare edit, OR ask first when the change is large and unconfirmed.
 * Resolves the action from the same pure inputs as the engine; on `ask` returns
 * an {@link AskedNewVersion} and writes NOTHING. Otherwise delegates to
 * {@link applyVersionLive} (overwrite / mint / checkpoint as resolved inside).
 */
export const commitOrAsk = (
  db: Db,
  documentId: string,
  documentType: DocumentType,
  createdBy: string,
  previousContent: string,
  content: string,
  label: string,
  options: CommitOptions,
): ResultAsync<CommitOutcome, CesareError> => {
  const action = resolveVersionAction({
    previousContent,
    nextContent: content,
    userRequestedNewVersion: options.userRequestedNewVersion,
    largeEditConfirmed: options.largeEditConfirmed,
    largeEditOverwriteConfirmed: options.largeEditOverwriteConfirmed ?? false,
  });
  if (action === "ask") {
    const asked: AskedNewVersion = {
      _tag: "asked",
      documentType,
      changedWordRatio: changedWordRatio(previousContent, content),
    };
    return okAsync(asked);
  }
  return applyVersionLive(
    db,
    documentId,
    documentType,
    createdBy,
    content,
    label,
    options,
  );
};

// Carries the Effect's typed `CesareError` (or a defect) through the `throw` that
// aborts the Postgres transaction, so neither the typed error nor a programming
// error is lost when the tx rolls back.
class TransactionAbort {
  constructor(
    readonly error: CesareError | null,
    readonly defect: unknown,
  ) {}
}

// Runs a fully-Db-provided Effect inside a real `db.transaction` and bridges the
// result back to `ResultAsync`. A typed `CesareError` failure THROWS inside the
// tx so Postgres rolls the whole transaction back (the hard atomicity boundary),
// then is re-surfaced on the neverthrow err channel with the original message
// preserved. Success commits the tx. A defect re-rejects untouched (programming
// error), mirroring the ACL.
const runInTransaction = (
  db: Db,
  build: (tx: Db) => Effect.Effect<CreatedDraft, CesareError>,
): ResultAsync<CreatedDraft, CesareError> =>
  toResultAsync(
    Effect.tryPromise({
      try: () =>
        db.transaction(async (tx) => {
          // The tx handle exposes the full query builder used by the Effect;
          // it lacks only the connection-level `$client` (never touched here),
          // hence the cast through `unknown`. Drizzle types the tx and the db
          // separately for this single property.
          const exit = await Effect.runPromiseExit(build(tx as unknown as Db));
          if (Exit.isSuccess(exit)) return exit.value;
          const failure = Cause.failureOption(exit.cause);
          const defect = Cause.dieOption(exit.cause);
          // Throw to abort the tx; package the typed error / defect so the outer
          // catch can route it correctly after the rollback.
          throw new TransactionAbort(
            failure._tag === "Some" ? failure.value : null,
            defect._tag === "Some" ? defect.value : null,
          );
        }),
      catch: (thrown) => {
        if (thrown instanceof TransactionAbort) {
          if (thrown.error) return thrown.error;
          // A defect (programming error) — re-throw via toResultAsync's defect
          // path by failing with a never-matched marker is wrong; instead surface
          // it as a CesareError carrying the message, since the boundary here is
          // the neverthrow err channel for this function's callers.
          const d = thrown.defect;
          return fail(
            d instanceof Error ? d.message : `applyVersionLive: ${String(d)}`,
          );
        }
        // The DB itself threw (e.g. a mock apply failure, a constraint) — the tx
        // already rolled back; surface the message on the err channel.
        return fail(
          thrown instanceof Error
            ? thrown.message
            : `applyVersionLive: ${String(thrown)}`,
        );
      },
    }),
  );
