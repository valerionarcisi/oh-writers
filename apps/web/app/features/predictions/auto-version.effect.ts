import { Cause, Effect, Exit, Layer } from "effect";
import { eq, sql } from "drizzle-orm";
import { documents, documentVersions } from "@oh-writers/db/schema";
import { type DocumentType } from "@oh-writers/domain";
import { buildWordDiffSegments } from "@oh-writers/utils";
import { ResultAsync } from "neverthrow";
import type { Db } from "~/server/db";
import { DbService, toResultAsync } from "~/server/effect";
import { CesareError } from "./cesare.errors";

// ─── Auto-versioning as `acquireRelease` (Spec 48 W-E4, reshaped by Spec 75) ─────
//
// The canonical Agentic Edit Pattern (CLAUDE.md point 3, Spec 75 / BUG-N66): ONE
// checkpoint per turn group, not a version per turn. The FIRST Cesare edit of a
// turn group INSERTS a new "working version" (the previous version, untouched, is
// the revert checkpoint); every subsequent edit in the same group OVERWRITES that
// working version in place. On error the apply rolls back so the document is
// never left half-applied.
//
// The invariant is made EXPLICIT with Effect's `acquireRelease`/`Scope`, so any
// future tool that mutates an entity inherits it for free:
//
//   acquire  → prepare the version: decide insert-vs-overwrite (the turn-group
//              membership, `resolveVersionWriteMode`), capture the "before"
//              snapshot, and on the insert path INSERT the new version row.
//   use      → apply live: write the content (and on insert, repoint the
//              document at the new version), so the open editor updates behind
//              the floating chat.
//   release  → ON FAILURE/INTERRUPTION ONLY, compensate: restore the captured
//              "before" (insert: revert pointer + delete row; overwrite: restore
//              the working version's prior content + label). No-op on success.
//
// The surrounding `db.transaction` is the real atomicity boundary — a throw rolls
// the whole tx back. The `acquireRelease` wrapper is the documented, testable
// guarantee on top of it. Belt and suspenders, by design.

// How the model asked this edit to be versioned: "overwrite" (default — stay in
// the turn group) or "new" (the user explicitly asked for a new version).
export type VersionIntent = "overwrite" | "new";

export interface VersionWriteOptions {
  readonly cesareSessionId: string | null;
  readonly intent: VersionIntent;
}

// A working version older than this is stale: reopening a chat session days
// later must never silently overwrite old work (Spec 75 condition 3).
export const CESARE_VERSION_GROUP_TTL_MS = 30 * 60 * 1000;

export interface CurrentVersionGroupMeta {
  readonly cesareSessionId: string | null;
  readonly updatedAt: Date;
}

export type VersionWriteMode = "insert" | "overwrite";

/**
 * The turn-group decision (Spec 75): overwrite the document's current version
 * in place iff the turn carries a session id, the current version is that same
 * session's working version, it is fresh within the group TTL, and the model
 * did not request a new version. Pure — pinned by Vitest.
 */
export const resolveVersionWriteMode = (
  intent: VersionIntent,
  cesareSessionId: string | null,
  currentVersion: CurrentVersionGroupMeta | null,
  now: Date,
): VersionWriteMode => {
  if (intent === "new") return "insert";
  if (!cesareSessionId || !currentVersion) return "insert";
  if (currentVersion.cesareSessionId !== cesareSessionId) return "insert";
  const ageMs = now.getTime() - currentVersion.updatedAt.getTime();
  return ageMs < CESARE_VERSION_GROUP_TTL_MS ? "overwrite" : "insert";
};

export interface CreatedDraft {
  versionId: string;
  /** Null on overwrite turns — no separate version row was created, so there is
   *  no per-turn revert target (rollback lives in the Versions SplitDrawer). */
  previousVersionId: string | null;
  documentType: DocumentType;
  label: string;
  /** Whether this turn inserted a new version row or overwrote the group's
   *  working version in place, so callers can phrase the outcome honestly. */
  writeMode: VersionWriteMode;
  diffSegments: ReturnType<typeof buildWordDiffSegments>;
}

// The resource produced by `acquire`: which row will receive the content plus
// the "before" snapshot needed to (a) build the word diff and (b) compensate on
// failure. On the insert path the row already exists when `use` runs; on the
// overwrite path `previousLabel` lets release restore the working version.
interface AcquiredVersion {
  mode: VersionWriteMode;
  versionId: string;
  previousVersionId: string | null;
  previousContent: string;
  previousLabel: string | null;
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

// acquire: prepare the version BEFORE any apply. Runs the empty-content guard
// first (fail fast, identical copy), reads the active version's group meta to
// decide insert-vs-overwrite, runs the mode-scoped duplicate guard, and on the
// insert path creates the new version row.
const acquireVersion = (
  documentId: string,
  createdBy: string,
  content: string,
  label: string,
  options: VersionWriteOptions,
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
    const currentVersionId = docRow?.currentVersionId ?? null;
    const previousContent = docRow?.content ?? "";

    const [currentVersion] = currentVersionId
      ? yield* dbStep(
          () =>
            db
              .select({
                cesareSessionId: documentVersions.cesareSessionId,
                updatedAt: documentVersions.updatedAt,
                content: documentVersions.content,
                label: documentVersions.label,
              })
              .from(documentVersions)
              .where(eq(documentVersions.id, currentVersionId))
              .limit(1),
          "acquireVersion.currentVersion",
        )
      : [];

    const mode = resolveVersionWriteMode(
      options.intent,
      options.cesareSessionId,
      currentVersion
        ? {
            cesareSessionId: currentVersion.cesareSessionId,
            updatedAt: currentVersion.updatedAt,
          }
        : null,
      new Date(),
    );

    if (mode === "overwrite" && currentVersionId && currentVersion) {
      // Overwrite turns cannot flood the version list, so the duplicate guard
      // only rejects a true no-op: content identical to the working version's
      // own current text (Spec 75).
      if (currentVersion.content.trim() === trimmed) {
        return yield* Effect.fail(
          fail(
            "Il modello ha restituito un testo identico a una versione esistente. Riformula la richiesta con un'istruzione più specifica (tono, struttura, lunghezza).",
          ),
        );
      }
      return {
        mode,
        versionId: currentVersionId,
        previousVersionId: null,
        // The version row is the source of truth for the "before" text: a
        // manual save can update the version while `documents.content` lags.
        previousContent: currentVersion.content,
        previousLabel: currentVersion.label,
      };
    }

    const existing = yield* dbStep(
      () =>
        db
          .select({ content: documentVersions.content })
          .from(documentVersions)
          .where(eq(documentVersions.documentId, documentId)),
      "acquireVersion.existing",
    );
    if (existing.some((e) => e.content.trim() === trimmed)) {
      return yield* Effect.fail(
        fail(
          "Il modello ha restituito un testo identico a una versione esistente. Riformula la richiesta con un'istruzione più specifica (tono, struttura, lunghezza).",
        ),
      );
    }
    const [maxRow] = yield* dbStep(
      () =>
        db
          .select({
            max: sql<number>`coalesce(max(${documentVersions.number}), 0)`,
          })
          .from(documentVersions)
          .where(eq(documentVersions.documentId, documentId)),
      "acquireVersion.maxRow",
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
            isDraft: false,
            cesareSessionId: options.cesareSessionId,
            createdBy,
          })
          .returning({ id: documentVersions.id }),
      "acquireVersion.insert",
    );
    if (!inserted) {
      return yield* Effect.fail(fail("applyVersionLive returned no rows"));
    }
    return {
      mode: "insert",
      versionId: inserted.id,
      previousVersionId: currentVersionId,
      previousContent,
      previousLabel: null,
    };
  });

// use: apply live so the open editor reflects the edit behind the floating chat.
// Insert mode points the document at the new version and mirrors its content;
// overwrite mode rewrites the working version in place (content + refreshed
// label — the label always describes the latest edit, Spec 75) and mirrors the
// content on the document row (the pointer is already correct).
const applyLive = (
  documentId: string,
  acquired: AcquiredVersion,
  content: string,
  label: string,
): Effect.Effect<void, CesareError, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    if (acquired.mode === "overwrite") {
      yield* dbStep(
        () =>
          db
            .update(documentVersions)
            .set({ content, label, updatedAt: new Date() })
            .where(eq(documentVersions.id, acquired.versionId)),
        "applyLive.overwriteVersion",
      );
      yield* dbStep(
        () =>
          db
            .update(documents)
            .set({ content, updatedAt: new Date() })
            .where(eq(documents.id, documentId)),
        "applyLive.mirrorContent",
      );
      return;
    }
    yield* dbStep(
      () =>
        db
          .update(documents)
          .set({
            currentVersionId: acquired.versionId,
            content,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId)),
      "applyLive.update",
    );
  });

// release (failure path only): restore the captured "before" so a failed apply
// never leaves a half-applied document. Insert mode reverts the document
// pointer + content and deletes the version row; overwrite mode restores the
// working version's prior content + label and the document content. Best-effort
// — the outer tx rollback is the hard guarantee; this is the explicit,
// observable compensation.
const rollbackApply = (
  documentId: string,
  acquired: AcquiredVersion,
): Effect.Effect<void, never, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    if (acquired.mode === "overwrite") {
      yield* Effect.ignore(
        dbStep(
          () =>
            db
              .update(documentVersions)
              .set({
                content: acquired.previousContent,
                label: acquired.previousLabel,
                updatedAt: new Date(),
              })
              .where(eq(documentVersions.id, acquired.versionId)),
          "rollbackApply.restoreWorkingVersion",
        ),
      );
      yield* Effect.ignore(
        dbStep(
          () =>
            db
              .update(documents)
              .set({
                content: acquired.previousContent,
                updatedAt: new Date(),
              })
              .where(eq(documents.id, documentId)),
          "rollbackApply.revertDocumentContent",
        ),
      );
      return;
    }
    yield* Effect.ignore(
      dbStep(
        () =>
          db
            .update(documents)
            .set({
              currentVersionId: acquired.previousVersionId,
              content: acquired.previousContent,
              updatedAt: new Date(),
            })
            .where(eq(documents.id, documentId)),
        "rollbackApply.revertDocument",
      ),
    );
    yield* Effect.ignore(
      dbStep(
        () =>
          db
            .delete(documentVersions)
            .where(eq(documentVersions.id, acquired.versionId)),
        "rollbackApply.deleteVersion",
      ),
    );
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
  options: VersionWriteOptions = { cesareSessionId: null, intent: "overwrite" },
): Effect.Effect<CreatedDraft, CesareError, DbService> =>
  Effect.acquireUseRelease(
    acquireVersion(documentId, createdBy, content, label, options),
    (acquired) =>
      applyLive(documentId, acquired, content, label).pipe(
        Effect.map(
          (): CreatedDraft => ({
            versionId: acquired.versionId,
            previousVersionId: acquired.previousVersionId,
            documentType,
            label,
            writeMode: acquired.mode,
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
      Exit.isFailure(exit) ? rollbackApply(documentId, acquired) : Effect.void,
  );

/**
 * Applies a Cesare edit live to the open document under the Spec 75 turn-group
 * policy: the first edit of a group auto-creates the working version (the
 * previous version is the revert checkpoint), subsequent same-group edits
 * overwrite it in place. The row is prepared BEFORE the apply and the apply
 * rolls back on error — guaranteed by {@link applyVersionLiveEffect}'s
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
  options: VersionWriteOptions = { cesareSessionId: null, intent: "overwrite" },
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
  );

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
