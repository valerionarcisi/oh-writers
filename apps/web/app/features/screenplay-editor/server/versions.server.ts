import { createServerFn } from "@tanstack/start";
import { ok, err, okAsync, errAsync, ResultAsync } from "neverthrow";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import {
  screenplayVersions,
  screenplays,
  breakdownElements,
  breakdownOccurrences,
  breakdownSceneState,
  scenes,
} from "@oh-writers/db/schema";
import { findElementInText } from "~/features/breakdown";
import { hashText } from "@oh-writers/utils/hash";
import {
  suggestNextColor,
  FIRST_DRAFT_COLOR,
  type DraftRevisionColor,
} from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import { requireProjectAccess } from "~/server/access";
import { stripYjsSnapshot } from "~/server/helpers";
import { syncScenesFromFountain } from "./scenes-sync";
import { yjsSnapshotFromFountain } from "./yjs-seed.server";
import {
  ListVersionsInput,
  GetVersionInput,
  CreateManualVersionInput,
  ImportAsActiveVersionInput,
  CreateVersionFromScratchInput,
  RestoreVersionInput,
  DeleteVersionInput,
  RenameVersionInput,
  DuplicateVersionInput,
  UpdateVersionMetaInput,
} from "../screenplay-versions.schema";
import type { VersionView } from "../screenplay-versions.schema";
import type { ScreenplayView } from "./screenplay.server";
import {
  VersionNotFoundError,
  CannotDeleteLastManualError,
  InvalidLabelError,
  ForbiddenError,
  DbError,
} from "../screenplay-versions.errors";
import { ScreenplayNotFoundError } from "../screenplay.errors";
import { ProjectNotFoundError } from "~/features/projects";

export type { VersionView };

// ─── ensureFirstVersion ───────────────────────────────────────────────────────
// Creates "Versione 1" for a screenplay if it has no versions yet.
// Accepts a db instance or a transaction so it can run inside an existing tx.

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// `screenplay_versions.number` is UNIQUE per screenplay. Compute max+1 so
// concurrent creates short-circuit via constraint rather than silently
// clobbering each other.
const nextVersionNumber = (db: DbOrTx, screenplayId: string): Promise<number> =>
  db
    .select({
      max: sql<number>`coalesce(max(${screenplayVersions.number}), 0)`,
    })
    .from(screenplayVersions)
    .where(eq(screenplayVersions.screenplayId, screenplayId))
    .then((rows) => (rows[0]?.max ?? 0) + 1);

const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

// Mirror of screenplay.server.ts's estimate — pages ≈ lines / 55. Kept local so
// the import-as-version path doesn't import the screenplay save module.
const estimatePageCount = (content: string): number =>
  Math.max(0, Math.ceil(content.split("\n").length / 55));

// Suggest the next revision color by reading existing colors for the
// screenplay (sorted by version number ascending) and walking the cycle.
const pickNextColorFor = async (
  db: DbOrTx,
  screenplayId: string,
): Promise<DraftRevisionColor> => {
  const rows = await db
    .select({
      color: screenplayVersions.draftColor,
      number: screenplayVersions.number,
    })
    .from(screenplayVersions)
    .where(eq(screenplayVersions.screenplayId, screenplayId))
    .orderBy(screenplayVersions.number);
  return suggestNextColor(
    rows.map((r) => r.color as DraftRevisionColor | null),
  );
};

export const ensureFirstVersion = async (
  db: DbOrTx,
  screenplayId: string,
  userId: string,
): Promise<void> => {
  const existing = await db
    .select({ value: count() })
    .from(screenplayVersions)
    .where(eq(screenplayVersions.screenplayId, screenplayId))
    .then((rows) => rows[0]?.value ?? 0);

  if (existing > 0) return;

  const screenplay = await db.query.screenplays
    .findFirst({ where: eq(screenplays.id, screenplayId) })
    .then((row) => row ?? null);

  if (!screenplay) return;

  await db.insert(screenplayVersions).values({
    screenplayId,
    number: 1,
    label: "Versione 1",
    content: screenplay.content,
    pageCount: screenplay.pageCount,
    draftColor: FIRST_DRAFT_COLOR,
    draftDate: todayIsoDate(),
    createdBy: userId,
  });
};

// ─── Authorization helper ─────────────────────────────────────────────────────
// Verifies that `userId` can read/write the screenplay identified by
// `screenplayId`. Returns the screenplay row on success so callers can reuse
// it without a second query.

// Loads the screenplay, then delegates project + membership + canEdit to the
// shared `requireProjectAccess` helper. Each not-found case keeps its own
// tag — the previous version remapped everything to `VersionNotFoundError`,
// which made it impossible for callers to tell a deleted project from a
// missing screenplay or version row.
type ScreenplayAccessError =
  | ScreenplayNotFoundError
  | ProjectNotFoundError
  | ForbiddenError
  | DbError;

const resolveScreenplayAccess = (
  db: Db,
  screenplayId: string,
): ResultAsync<typeof screenplays.$inferSelect, ScreenplayAccessError> =>
  ResultAsync.fromPromise(
    db.query.screenplays
      .findFirst({ where: eq(screenplays.id, screenplayId) })
      .then((row) => row ?? null),
    (e) => new DbError("resolveScreenplayAccess.screenplay", e),
  )
    .andThen(
      (
        s,
      ): ResultAsync<typeof screenplays.$inferSelect, ScreenplayAccessError> =>
        s ? okAsync(s) : errAsync(new ScreenplayNotFoundError(screenplayId)),
    )
    .andThen((s) => requireProjectAccess(db, s.projectId, "edit").map(() => s));

// Same helper but resolves from a versionId — avoids an extra query in the
// callers that already need the version row.
type VersionAccessError = VersionNotFoundError | ScreenplayAccessError;

const resolveVersionAccess = (
  db: Db,
  versionId: string,
): ResultAsync<typeof screenplayVersions.$inferSelect, VersionAccessError> =>
  ResultAsync.fromPromise(
    db.query.screenplayVersions
      .findFirst({ where: eq(screenplayVersions.id, versionId) })
      .then((row) => row ?? null),
    (e) => new DbError("resolveVersionAccess.find", e),
  )
    .andThen(
      (
        v,
      ): ResultAsync<
        typeof screenplayVersions.$inferSelect,
        VersionAccessError
      > => (v ? okAsync(v) : errAsync(new VersionNotFoundError(versionId))),
    )
    .andThen((v) => resolveScreenplayAccess(db, v.screenplayId).map(() => v));

// ─── List versions ────────────────────────────────────────────────────────────

export const listVersions = createServerFn({ method: "GET" })
  .validator(ListVersionsInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<VersionView[], VersionAccessError>> => {
      // resolveScreenplayAccess already enforces requireUser via requireProjectAccess.
      const db = await getDb();

      const access = await resolveScreenplayAccess(db, data.screenplayId);
      if (access.isErr()) return toShape(err(access.error));

      return toShape(
        await ResultAsync.fromPromise(
          db.query.screenplayVersions
            .findMany({
              where: eq(screenplayVersions.screenplayId, data.screenplayId),
              orderBy: [desc(screenplayVersions.createdAt)],
            })
            .then((rows) => rows.map(stripYjsSnapshot)),
          (e) => new DbError("listVersions", e),
        ),
      );
    },
  );

export const versionsQueryOptions = (screenplayId: string) =>
  queryOptions({
    queryKey: ["versions", screenplayId] as const,
    queryFn: () => listVersions({ data: { screenplayId } }),
    enabled: screenplayId.length > 0,
  });

// ─── Current (active) version id ──────────────────────────────────────────────
// The screenplay's `current_version_id` points at the active version. The
// Versions surface reads it to show the "Attuale" badge + gate delete on the
// current version (you can't delete the active one).
export const getCurrentVersionId = createServerFn({ method: "GET" })
  .validator(ListVersionsInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<string | null, ScreenplayAccessError>> => {
      const db = await getDb();
      const access = await resolveScreenplayAccess(db, data.screenplayId);
      if (access.isErr()) return toShape(err(access.error));
      return toShape(ok(access.value.currentVersionId ?? null));
    },
  );

export const currentVersionIdQueryOptions = (screenplayId: string) =>
  queryOptions({
    queryKey: ["screenplay-current-version", screenplayId] as const,
    queryFn: () => getCurrentVersionId({ data: { screenplayId } }),
    enabled: screenplayId.length > 0,
  });

// ─── Get single version ───────────────────────────────────────────────────────

export const getVersion = createServerFn({ method: "GET" })
  .validator(GetVersionInput)
  .handler(
    async ({ data }): Promise<ResultShape<VersionView, VersionAccessError>> => {
      // resolveVersionAccess already enforces requireUser via requireProjectAccess.
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId);
      if (access.isErr()) return toShape(err(access.error));

      return toShape(ok(stripYjsSnapshot(access.value)));
    },
  );

export const versionQueryOptions = (versionId: string) =>
  queryOptions({
    queryKey: ["versions", "detail", versionId] as const,
    queryFn: () => getVersion({ data: { versionId } }),
  });

// ─── Create manual version ────────────────────────────────────────────────────

export const createManualVersion = createServerFn({ method: "POST" })
  .validator(CreateManualVersionInput)
  .handler(
    async ({ data }): Promise<ResultShape<VersionView, VersionAccessError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveScreenplayAccess(db, data.screenplayId);
      if (access.isErr()) return toShape(err(access.error));
      const screenplay = access.value;

      // Checkpoint: snapshot the CURRENT live content into a new named version,
      // carrying the breakdown forward. The live screenplay is left untouched —
      // the import flow calls this to preserve the pre-import draft before
      // overwriting the editor. A fresh BLANK version is a different operation
      // (`createBlankVersion`), do not conflate the two.
      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const [number, draftColor] = await Promise.all([
              nextVersionNumber(tx, data.screenplayId),
              pickNextColorFor(tx, data.screenplayId),
            ]);
            const prevVersion = await tx
              .select({ id: screenplayVersions.id })
              .from(screenplayVersions)
              .where(eq(screenplayVersions.screenplayId, data.screenplayId))
              .orderBy(desc(screenplayVersions.number))
              .limit(1);
            const prevVersionId = prevVersion[0]?.id ?? null;
            // Snapshot the CRDT too: the screenplay content is version-backed
            // in Yjs, so the checkpoint must carry the live CRDT (the active
            // version's snapshot, falling back to the screenplay-level state)
            // or the new version would be an empty husk.
            const liveSnapshot = screenplay.currentVersionId
              ? ((
                  await tx.query.screenplayVersions.findFirst({
                    where: eq(
                      screenplayVersions.id,
                      screenplay.currentVersionId,
                    ),
                    columns: { yjsSnapshot: true },
                  })
                )?.yjsSnapshot ?? screenplay.yjsState)
              : screenplay.yjsState;
            const inserted = await tx
              .insert(screenplayVersions)
              .values({
                screenplayId: data.screenplayId,
                number,
                label: data.label,
                content: screenplay.content,
                pageCount: screenplay.pageCount,
                yjsSnapshot: liveSnapshot,
                draftColor,
                draftDate: todayIsoDate(),
                createdBy: user.id,
              })
              .returning()
              .then((rows) => rows[0]);
            if (inserted && prevVersionId) {
              await cloneBreakdownToNewVersionInline(
                tx,
                prevVersionId,
                inserted.id,
              );
            }
            return inserted;
          }),
          (e) => new DbError("createManualVersion", e),
        ).andThen((v) =>
          v ? ok(stripYjsSnapshot(v)) : err(new VersionNotFoundError("new")),
        ),
      );
    },
  );

// ─── Create blank version ─────────────────────────────────────────────────────
// "+ Nuova versione": a brand-new EMPTY version that becomes the active one, so
// the editor reloads to a clean page to write on. Mirrors the narrative
// `createVersionFromScratch`. Content is version-backed (`getScreenplay` reads
// the active version row), so blanking the editor is just: insert an empty
// version + point `current_version_id` at it. The previous draft is preserved
// automatically — it stays in its own version row. The live `screenplays`
// mirror is blanked too for legacy readers, and downstream artefacts are marked
// stale (coherent with `restoreVersion`).
export const createBlankVersion = createServerFn({ method: "POST" })
  .validator(CreateVersionFromScratchInput)
  .handler(
    async ({ data }): Promise<ResultShape<VersionView, VersionAccessError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveScreenplayAccess(db, data.screenplayId);
      if (access.isErr()) return toShape(err(access.error));

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const [number, draftColor] = await Promise.all([
              nextVersionNumber(tx, data.screenplayId),
              pickNextColorFor(tx, data.screenplayId),
            ]);
            const inserted = await tx
              .insert(screenplayVersions)
              .values({
                screenplayId: data.screenplayId,
                number,
                label: data.label ?? null,
                content: "",
                pageCount: 0,
                draftColor,
                draftDate: todayIsoDate(),
                createdBy: user.id,
              })
              .returning()
              .then((rows) => rows[0]);

            if (inserted) {
              await tx
                .update(screenplays)
                .set({
                  content: "",
                  pageCount: 0,
                  // Clear the screenplay-level CRDT too so a legacy-room
                  // fallback can't resurrect the previous draft onto the blank
                  // version. The new version's own yjs_snapshot is NULL → the
                  // version-scoped room seeds empty.
                  yjsState: null,
                  currentVersionId: inserted.id,
                  updatedAt: new Date(),
                  breakdownStale: true,
                  locationsStale: true,
                  budgetStale: true,
                  scheduleStale: true,
                })
                .where(eq(screenplays.id, data.screenplayId));
            }
            return inserted;
          }),
          (e) => new DbError("createBlankVersion", e),
        ).andThen((v) =>
          v ? ok(stripYjsSnapshot(v)) : err(new VersionNotFoundError("new")),
        ),
      );
    },
  );

// ─── Import as active version ───────────────────────────────────────────────
// Spec 71: import the given Fountain as a NEW version that becomes ACTIVE. The
// previous draft is preserved untouched in its own version row (it was the
// active version; it simply stops being current). Same activation mechanics as
// `createBlankVersion`, but seeded with imported content instead of empty:
//   - the new version row carries `content` and a NULL `yjs_snapshot`;
//   - `screenplays` is pointed at the new version and its `pm_doc`/`yjs_state`
//     are cleared so the editor reseeds from `fountainToDoc(content)` on the
//     `key={currentVersionId}` remount, with no stale pmDoc or CRDT to fight.

export interface ImportAsActiveVersionParams {
  screenplayId: string;
  label: string;
  content: string;
  /** The active version before this import, or null. Breakdown is cloned from it. */
  prevActiveId: string | null;
  userId: string;
}

// The write half, isolated so a fake-tx unit test can assert the contract
// (insert new version, repoint current, clear pmDoc/yjsState, mark stale)
// against the production code rather than a mock of it. Returns the updated
// screenplay row. Caller wraps in a transaction + maps errors.
export const importAsActiveVersionTx = async (
  tx: DbOrTx,
  params: ImportAsActiveVersionParams,
): Promise<typeof screenplays.$inferSelect> => {
  const pageCount = estimatePageCount(params.content);
  const [number, draftColor] = await Promise.all([
    nextVersionNumber(tx, params.screenplayId),
    pickNextColorFor(tx, params.screenplayId),
  ]);

  // Seed the version's CRDT snapshot from the imported Fountain server-side.
  // A NULL snapshot would make the room rely on the first client to seed it,
  // which races the editor remount + autosave and lets an empty seed clobber
  // the imported content (data loss). A populated snapshot makes the room
  // authoritative: the client sees a non-empty fragment and never re-seeds.
  const snapshot = yjsSnapshotFromFountain(params.content);

  const inserted = await tx
    .insert(screenplayVersions)
    .values({
      screenplayId: params.screenplayId,
      number,
      label: params.label,
      content: params.content,
      pageCount,
      yjsSnapshot: snapshot,
      draftColor,
      draftDate: todayIsoDate(),
      createdBy: params.userId,
    })
    .returning()
    .then((rows) => rows[0]);
  if (!inserted) throw new Error("Import returned no version row");

  await tx
    .update(screenplays)
    .set({
      content: params.content,
      // Clear the stored PM doc so a legacy reader rebuilds from the imported
      // Fountain. Mirror the same CRDT onto the screenplay-level state so any
      // legacy (non-version-scoped) room also loads the imported content.
      pmDoc: null,
      yjsState: snapshot,
      currentVersionId: inserted.id,
      pageCount,
      updatedAt: new Date(),
      breakdownStale: true,
      locationsStale: true,
      budgetStale: true,
      scheduleStale: true,
    })
    .where(eq(screenplays.id, params.screenplayId));

  // Mirror the imported scenes so the breakdown route sees them, and carry
  // prior breakdown tagging forward where the text still matches.
  await syncScenesFromFountain(tx, params.screenplayId, params.content);
  if (params.prevActiveId) {
    await cloneBreakdownToNewVersionInline(
      tx,
      params.prevActiveId,
      inserted.id,
    );
  }

  const updated = await tx.query.screenplays.findFirst({
    where: eq(screenplays.id, params.screenplayId),
  });
  if (!updated) throw new Error("Import: screenplay vanished");
  return updated;
};

export const importAsActiveVersion = createServerFn({ method: "POST" })
  .validator(ImportAsActiveVersionInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ScreenplayView, VersionAccessError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveScreenplayAccess(db, data.screenplayId);
      if (access.isErr()) return toShape(err(access.error));
      const screenplay = access.value;

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction((tx) =>
            importAsActiveVersionTx(tx, {
              screenplayId: data.screenplayId,
              label: data.label,
              content: data.content,
              prevActiveId: screenplay.currentVersionId ?? null,
              userId: user.id,
            }),
          ),
          (e) => new DbError("importAsActiveVersion", e),
        ).map((updated) => {
          const { yjsState: _, ...view } = updated;
          return view;
        }),
      );
    },
  );

/**
 * Clone breakdown occurrences from a previous screenplay version into a
 * newly-created version, flagging occurrences whose element text no longer
 * appears in the scene text as `isStale`. Mirrors the stand-alone
 * `cloneBreakdownToVersion` server fn but runs inline so version creation
 * and breakdown carry-over are a single write surface.
 */
const cloneBreakdownToNewVersionInline = async (
  tx: DbOrTx,
  fromVersionId: string,
  toVersionId: string,
): Promise<void> => {
  const sourceRows = await tx
    .select({
      occ: breakdownOccurrences,
      el: breakdownElements,
      scene: scenes,
    })
    .from(breakdownOccurrences)
    .innerJoin(
      breakdownElements,
      eq(breakdownOccurrences.elementId, breakdownElements.id),
    )
    .innerJoin(scenes, eq(scenes.id, breakdownOccurrences.sceneId))
    .where(eq(breakdownOccurrences.screenplayVersionId, fromVersionId));

  if (sourceRows.length === 0) return;

  const sceneHashes = new Map<string, string>();
  const occurrenceValues = sourceRows.map((r) => {
    const sceneText = r.scene.heading + "\n" + (r.scene.notes ?? "");
    if (!sceneHashes.has(r.scene.id)) {
      sceneHashes.set(r.scene.id, hashText(sceneText));
    }
    return {
      elementId: r.el.id,
      screenplayVersionId: toVersionId,
      sceneId: r.scene.id,
      quantity: r.occ.quantity,
      note: r.occ.note,
      cesareStatus: r.occ.cesareStatus,
      isStale: !findElementInText(r.el.name, sceneText),
    };
  });

  await tx
    .insert(breakdownOccurrences)
    .values(occurrenceValues)
    .onConflictDoNothing();

  const sceneStateValues = Array.from(sceneHashes, ([sceneId, hash]) => ({
    sceneId,
    screenplayVersionId: toVersionId,
    textHash: hash,
  }));

  if (sceneStateValues.length > 0) {
    await tx
      .insert(breakdownSceneState)
      .values(sceneStateValues)
      .onConflictDoUpdate({
        target: [
          breakdownSceneState.sceneId,
          breakdownSceneState.screenplayVersionId,
        ],
        set: { textHash: sql`excluded.text_hash` },
      });
  }
};

// ─── Restore version ──────────────────────────────────────────────────────────

export const restoreVersion = createServerFn({ method: "POST" })
  .validator(RestoreVersionInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ScreenplayView, VersionAccessError>> => {
      // resolveVersionAccess already enforces requireUser via requireProjectAccess.
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId);
      if (access.isErr()) return toShape(err(access.error));
      const version = access.value;

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            // Reseed the CRDT from the activated version's content. The editor is
            // Yjs-backed: it reads the live CRDT, NOT `content`. Updating only
            // `content` (as before) left the old `yjsState`/`pmDoc` in place, so
            // the editor kept showing the previous version — "Attiva" looked like
            // a no-op. Mirror the import flow: clear pmDoc, rebuild yjsState from
            // the version's Fountain so the room is authoritative on reload.
            const snapshot = yjsSnapshotFromFountain(version.content);
            const [updated] = await tx
              .update(screenplays)
              .set({
                content: version.content,
                pageCount: version.pageCount,
                pmDoc: null,
                yjsState: snapshot,
                // Activating a version makes it the CURRENT one (the chip/badge
                // + the delete guard read this). Without it "Attiva" only copied
                // content and left no current pointer, so it looked like a no-op.
                currentVersionId: version.id,
                updatedAt: new Date(),
                breakdownStale: true,
                locationsStale: true,
                budgetStale: true,
                scheduleStale: true,
              })
              .where(eq(screenplays.id, version.screenplayId))
              .returning();

            if (!updated) throw new Error("Restore returned no rows");
            return updated;
          }),
          (e) => new DbError("restoreVersion", e),
        ).map((updated) => {
          const { yjsState: _, ...view } = updated;
          return view;
        }),
      );
    },
  );

// ─── Delete version ───────────────────────────────────────────────────────────

export const deleteVersion = createServerFn({ method: "POST" })
  .validator(DeleteVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, VersionAccessError | CannotDeleteLastManualError>
    > => {
      // resolveVersionAccess already enforces requireUser via requireProjectAccess.
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId);
      if (access.isErr()) return toShape(err(access.error));
      const version = access.value;

      const countResult = await ResultAsync.fromPromise(
        db
          .select({ value: count() })
          .from(screenplayVersions)
          .where(eq(screenplayVersions.screenplayId, version.screenplayId))
          .then((rows) => rows[0]?.value ?? 0),
        (e) => new DbError("deleteVersion.count", e),
      );
      if (countResult.isErr()) return toShape(err(countResult.error));
      if (countResult.value <= 1)
        return toShape(err(new CannotDeleteLastManualError()));

      return toShape(
        await ResultAsync.fromPromise(
          db
            .delete(screenplayVersions)
            .where(eq(screenplayVersions.id, data.versionId)),
          (e) => new DbError("deleteVersion", e),
        ).map(() => undefined),
      );
    },
  );

// ─── Rename version ───────────────────────────────────────────────────────────

export const renameVersion = createServerFn({ method: "POST" })
  .validator(RenameVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<VersionView, VersionAccessError | InvalidLabelError>
    > => {
      // resolveVersionAccess already enforces requireUser via requireProjectAccess.
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId);
      if (access.isErr()) return toShape(err(access.error));

      return toShape(
        await ResultAsync.fromPromise(
          db
            .update(screenplayVersions)
            .set({ label: data.label })
            .where(eq(screenplayVersions.id, data.versionId))
            .returning()
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("renameVersion", e),
        ).andThen((row) =>
          row
            ? ok(stripYjsSnapshot(row))
            : err(new VersionNotFoundError(data.versionId)),
        ),
      );
    },
  );

// ─── Duplicate version ────────────────────────────────────────────────────────

export const duplicateVersion = createServerFn({ method: "POST" })
  .validator(DuplicateVersionInput)
  .handler(
    async ({ data }): Promise<ResultShape<VersionView, VersionAccessError>> => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId);
      if (access.isErr()) return toShape(err(access.error));
      const source = access.value;

      return toShape(
        await ResultAsync.fromPromise(
          Promise.all([
            nextVersionNumber(db, source.screenplayId),
            pickNextColorFor(db, source.screenplayId),
          ]).then(([number, draftColor]) =>
            db
              .insert(screenplayVersions)
              .values({
                screenplayId: source.screenplayId,
                number,
                label: data.label,
                content: source.content,
                pageCount: source.pageCount,
                draftColor,
                draftDate: todayIsoDate(),
                createdBy: user.id,
              })
              .returning()
              .then((rows) => rows[0]),
          ),
          (e) => new DbError("duplicateVersion", e),
        ).andThen((v) =>
          v ? ok(stripYjsSnapshot(v)) : err(new VersionNotFoundError("new")),
        ),
      );
    },
  );

// ─── Update version meta (color + date) ───────────────────────────────────────

export const updateVersionMeta = createServerFn({ method: "POST" })
  .validator(UpdateVersionMetaInput)
  .handler(
    async ({ data }): Promise<ResultShape<VersionView, VersionAccessError>> => {
      // resolveVersionAccess already enforces requireUser via requireProjectAccess.
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId);
      if (access.isErr()) return toShape(err(access.error));

      const patch: Partial<{
        draftColor: string | null;
        draftDate: string | null;
      }> = {};
      if (Object.prototype.hasOwnProperty.call(data, "draftColor"))
        patch.draftColor = data.draftColor ?? null;
      if (Object.prototype.hasOwnProperty.call(data, "draftDate"))
        patch.draftDate = data.draftDate ?? null;

      if (Object.keys(patch).length === 0)
        return toShape(ok(stripYjsSnapshot(access.value)));

      return toShape(
        await ResultAsync.fromPromise(
          db
            .update(screenplayVersions)
            .set(patch)
            .where(eq(screenplayVersions.id, data.versionId))
            .returning()
            .then((rows) => rows[0] ?? null),
          (e) => new DbError("updateVersionMeta", e),
        ).andThen((row) =>
          row
            ? ok(stripYjsSnapshot(row))
            : err(new VersionNotFoundError(data.versionId)),
        ),
      );
    },
  );
