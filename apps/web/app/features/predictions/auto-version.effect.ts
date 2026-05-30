import { Cause, Effect, Exit, Layer } from "effect";
import { eq, sql } from "drizzle-orm";
import { documents, documentVersions } from "@oh-writers/db/schema";
import { type DocumentType } from "@oh-writers/domain";
import { buildWordDiffSegments } from "@oh-writers/utils";
import { ResultAsync } from "neverthrow";
import type { Db } from "~/server/db";
import { DbService, toResultAsync } from "~/server/effect";
import { CesareError } from "./cesare.errors";

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

// The resource produced by `acquire`: the new version row plus the "before"
// snapshot needed to (a) build the word diff and (b) compensate on failure.
interface AcquiredVersion {
  versionId: string;
  previousVersionId: string | null;
  previousContent: string;
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

// acquire: create the version BEFORE any apply. Runs the empty-content and
// duplicate-content guards first (fail fast, identical copy), reads the active
// version as the "before" snapshot, then inserts the new version row.
const acquireVersion = (
  documentId: string,
  createdBy: string,
  content: string,
  label: string,
): Effect.Effect<AcquiredVersion, CesareError, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const trimmed = content.trim();
    if (!trimmed) {
      return yield* Effect.fail(
        fail("Il modello ha restituito un contenuto vuoto."),
      );
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
            createdBy,
          })
          .returning({ id: documentVersions.id }),
      "acquireVersion.insert",
    );
    if (!inserted) {
      return yield* Effect.fail(fail("applyVersionLive returned no rows"));
    }
    return { versionId: inserted.id, previousVersionId, previousContent };
  });

// use: apply live — point the document at the new version and mirror its content
// so the open editor reflects it behind the floating chat.
const applyLive = (
  documentId: string,
  acquired: AcquiredVersion,
  content: string,
): Effect.Effect<void, CesareError, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
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

// release (failure path only): revert the document pointer + content to the
// captured "before" and delete the version row, so a failed apply never leaves a
// half-applied document. Best-effort — the outer tx rollback is the hard
// guarantee; this is the explicit, observable compensation.
const rollbackApply = (
  documentId: string,
  acquired: AcquiredVersion,
): Effect.Effect<void, never, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
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
): Effect.Effect<CreatedDraft, CesareError, DbService> =>
  Effect.acquireUseRelease(
    acquireVersion(documentId, createdBy, content, label),
    (acquired) =>
      applyLive(documentId, acquired, content).pipe(
        Effect.map(
          (): CreatedDraft => ({
            versionId: acquired.versionId,
            previousVersionId: acquired.previousVersionId,
            documentType,
            label,
            // Word-level diff (previous active content → new content) for the
            // inline "Mostra modifiche" coloured rendering. Empty on first write
            // (no prior content to diff against). MUST survive — Spec 47d.
            diffSegments: acquired.previousContent.trim()
              ? buildWordDiffSegments(acquired.previousContent, content)
              : [],
          }),
        ),
      ),
    (acquired, exit) =>
      Exit.isFailure(exit) ? rollbackApply(documentId, acquired) : Effect.void,
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
): ResultAsync<CreatedDraft, CesareError> =>
  runInTransaction(db, (tx) =>
    applyVersionLiveEffect(
      documentId,
      documentType,
      createdBy,
      content,
      label,
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
