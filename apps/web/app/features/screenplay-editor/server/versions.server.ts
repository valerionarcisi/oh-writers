import { createServerFn } from "@tanstack/start";
import { ok, err, okAsync, errAsync, ResultAsync } from "neverthrow";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import {
  screenplayVersions,
  screenplays,
  projects,
  teamMembers,
} from "@oh-writers/db/schema";
import {
  TeamRoles,
  suggestNextColor,
  FIRST_DRAFT_COLOR,
  type DraftRevisionColor,
} from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import { stripYjsSnapshot } from "~/server/helpers";
import {
  ListVersionsInput,
  GetVersionInput,
  CreateManualVersionInput,
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

const resolveScreenplayAccess = (
  db: Db,
  screenplayId: string,
  userId: string,
): ResultAsync<
  typeof screenplays.$inferSelect,
  VersionNotFoundError | ForbiddenError | DbError
> =>
  ResultAsync.fromPromise(
    db.query.screenplays
      .findFirst({ where: eq(screenplays.id, screenplayId) })
      .then((row) => row ?? null),
    (e) => new DbError("resolveScreenplayAccess.screenplay", e),
  )
    .andThen((s) => (s ? ok(s) : err(new VersionNotFoundError(screenplayId))))
    .andThen((s) =>
      ResultAsync.fromPromise(
        db.query.projects
          .findFirst({ where: eq(projects.id, s.projectId) })
          .then((row) => row ?? null),
        (e) => new DbError("resolveScreenplayAccess.project", e),
      ).map((p) => ({ s, p })),
    )
    .andThen(({ s, p }) => {
      if (!p) return errAsync(new VersionNotFoundError(s.projectId));

      // Personal project — owner only
      if (p.ownerId !== null) {
        return p.ownerId === userId
          ? okAsync(s)
          : errAsync(new ForbiddenError("access screenplay versions"));
      }

      // Team project — owner or editor
      if (!p.teamId)
        return errAsync(new ForbiddenError("access screenplay versions"));

      return ResultAsync.fromPromise(
        db.query.teamMembers
          .findFirst({
            where: and(
              eq(teamMembers.teamId, p.teamId),
              eq(teamMembers.userId, userId),
            ),
          })
          .then((row) => row ?? null),
        (e) => new DbError("resolveScreenplayAccess.membership", e),
      ).andThen((member) => {
        if (!member)
          return err(new ForbiddenError("access screenplay versions"));
        const canEdit =
          member.role === TeamRoles.OWNER || member.role === TeamRoles.EDITOR;
        return canEdit
          ? ok(s)
          : err(new ForbiddenError("access screenplay versions"));
      });
    });

// Same helper but resolves from a versionId — avoids an extra query in the
// callers that already need the version row.
const resolveVersionAccess = (
  db: Db,
  versionId: string,
  userId: string,
): ResultAsync<
  typeof screenplayVersions.$inferSelect,
  VersionNotFoundError | ForbiddenError | DbError
> =>
  ResultAsync.fromPromise(
    db.query.screenplayVersions
      .findFirst({ where: eq(screenplayVersions.id, versionId) })
      .then((row) => row ?? null),
    (e) => new DbError("resolveVersionAccess.find", e),
  )
    .andThen((v) => (v ? ok(v) : err(new VersionNotFoundError(versionId))))
    .andThen((v) =>
      resolveScreenplayAccess(db, v.screenplayId, userId).map(() => v),
    );

// ─── List versions ────────────────────────────────────────────────────────────

export const listVersions = createServerFn({ method: "GET" })
  .validator(ListVersionsInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        VersionView[],
        VersionNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveScreenplayAccess(
        db,
        data.screenplayId,
        user.id,
      );
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
  });

// ─── Get single version ───────────────────────────────────────────────────────

export const getVersion = createServerFn({ method: "GET" })
  .validator(GetVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<VersionView, VersionNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId, user.id);
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
    async ({
      data,
    }): Promise<
      ResultShape<VersionView, VersionNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveScreenplayAccess(
        db,
        data.screenplayId,
        user.id,
      );
      if (access.isErr()) return toShape(err(access.error));
      const screenplay = access.value;

      return toShape(
        await ResultAsync.fromPromise(
          Promise.all([
            nextVersionNumber(db, data.screenplayId),
            pickNextColorFor(db, data.screenplayId),
          ]).then(([number, draftColor]) =>
            db
              .insert(screenplayVersions)
              .values({
                screenplayId: data.screenplayId,
                number,
                label: data.label,
                content: screenplay.content,
                pageCount: screenplay.pageCount,
                draftColor,
                draftDate: todayIsoDate(),
                createdBy: user.id,
              })
              .returning()
              .then((rows) => rows[0]),
          ),
          (e) => new DbError("createManualVersion", e),
        ).andThen((v) =>
          v ? ok(stripYjsSnapshot(v)) : err(new VersionNotFoundError("new")),
        ),
      );
    },
  );

// ─── Restore version ──────────────────────────────────────────────────────────

export const restoreVersion = createServerFn({ method: "POST" })
  .validator(RestoreVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        ScreenplayView,
        VersionNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId, user.id);
      if (access.isErr()) return toShape(err(access.error));
      const version = access.value;

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const [updated] = await tx
              .update(screenplays)
              .set({
                content: version.content,
                pageCount: version.pageCount,
                updatedAt: new Date(),
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
      ResultShape<
        void,
        | VersionNotFoundError
        | CannotDeleteLastManualError
        | ForbiddenError
        | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId, user.id);
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
      ResultShape<
        VersionView,
        VersionNotFoundError | InvalidLabelError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId, user.id);
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
    async ({
      data,
    }): Promise<
      ResultShape<VersionView, VersionNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId, user.id);
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
    async ({
      data,
    }): Promise<
      ResultShape<VersionView, VersionNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const access = await resolveVersionAccess(db, data.versionId, user.id);
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
