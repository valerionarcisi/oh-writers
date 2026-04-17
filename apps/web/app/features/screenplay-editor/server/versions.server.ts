import { createServerFn } from "@tanstack/start";
import { ok, err, okAsync, errAsync, ResultAsync } from "neverthrow";
import { eq, desc, sql } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import {
  screenplayVersions,
  screenplays,
  projects,
} from "@oh-writers/db/schema";
import type { ScreenplayVersion } from "@oh-writers/db";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import { stripYjsSnapshot } from "~/server/helpers";
import { canEdit, getMembership } from "~/server/permissions";
import {
  ListVersionsInput,
  GetVersionInput,
  CreateVersionFromScratchInput,
  DuplicateVersionInput,
  RenameVersionInput,
  SwitchVersionInput,
  DeleteVersionInput,
  SaveVersionContentInput,
  CreateManualVersionInput,
  RestoreVersionInput,
} from "../screenplay-versions.schema";
import type { VersionView } from "../screenplay-versions.schema";
import type { ScreenplayView } from "./screenplay.server";
import {
  VersionNotFoundError,
  CannotDeleteLastManualError,
  ForbiddenError,
  ValidationError,
  DbError,
} from "../screenplay-versions.errors";

export type { VersionView };

// ─── Shared guards ────────────────────────────────────────────────────────────

type ScreenplayRow = typeof screenplays.$inferSelect;

const findScreenplay = (db: Db, screenplayId: string) =>
  ResultAsync.fromPromise(
    db.query.screenplays
      .findFirst({ where: eq(screenplays.id, screenplayId) })
      .then((row) => row ?? null),
    (e) => new DbError("versions.findScreenplay", e),
  ).andThen((row) =>
    row ? ok(row) : err(new VersionNotFoundError(screenplayId)),
  );

const findVersion = (db: Db, versionId: string) =>
  ResultAsync.fromPromise(
    db.query.screenplayVersions
      .findFirst({ where: eq(screenplayVersions.id, versionId) })
      .then((row) => row ?? null),
    (e) => new DbError("versions.findVersion", e),
  ).andThen((row) =>
    row ? ok(row) : err(new VersionNotFoundError(versionId)),
  );

const assertCanEdit = (db: Db, screenplay: ScreenplayRow, userId: string) =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, screenplay.projectId) })
      .then((row) => row ?? null),
    (e) => new DbError("versions.project", e),
  )
    .andThen((project) =>
      project
        ? ok(project)
        : err(new VersionNotFoundError(screenplay.projectId)),
    )
    .andThen((project) =>
      (project.teamId
        ? getMembership(db, project.teamId, userId)
        : ResultAsync.fromSafePromise(Promise.resolve(null))
      ).map((membership) => ({ project, membership })),
    )
    .andThen(({ project, membership }) =>
      canEdit(project, userId, membership)
        ? ok(null)
        : err(new ForbiddenError("mutate screenplay version")),
    );

const nextNumber = (db: Db, screenplayId: string) =>
  ResultAsync.fromPromise(
    db
      .select({
        max: sql<number>`coalesce(max(${screenplayVersions.number}), 0)`,
      })
      .from(screenplayVersions)
      .where(eq(screenplayVersions.screenplayId, screenplayId))
      .then((rows) => (rows[0]?.max ?? 0) + 1),
    (e) => new DbError("versions.nextNumber", e),
  );

// ─── listVersions ─────────────────────────────────────────────────────────────

export const listVersions = createServerFn({ method: "GET" })
  .validator(ListVersionsInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<VersionView[], VersionNotFoundError | DbError>> => {
      await requireUser();
      const db = await getDb();

      return toShape(
        await ResultAsync.fromPromise(
          db.query.screenplayVersions
            .findMany({
              where: eq(screenplayVersions.screenplayId, data.screenplayId),
              orderBy: [desc(screenplayVersions.number)],
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

// ─── getVersion ───────────────────────────────────────────────────────────────

export const getVersion = createServerFn({ method: "GET" })
  .validator(GetVersionInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<VersionView, VersionNotFoundError | DbError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        db.query.screenplayVersions
          .findFirst({ where: eq(screenplayVersions.id, data.versionId) })
          .then((row) => row ?? null),
        (e) => new DbError("getVersion", e),
      );

      if (result.isErr()) return toShape(err(result.error));
      if (!result.value)
        return toShape(err(new VersionNotFoundError(data.versionId)));

      return toShape(ok(stripYjsSnapshot(result.value)));
    },
  );

export const versionQueryOptions = (versionId: string) =>
  queryOptions({
    queryKey: ["versions", "detail", versionId] as const,
    queryFn: () => getVersion({ data: { versionId } }),
  });

// ─── createVersionFromScratch ─────────────────────────────────────────────────

export const createVersionFromScratch = createServerFn({ method: "POST" })
  .validator(CreateVersionFromScratchInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<VersionView, VersionNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findScreenplay(db, data.screenplayId)
          .andThen((s) => assertCanEdit(db, s, user.id).map(() => s))
          .andThen((s) => nextNumber(db, s.id).map((number) => ({ s, number })))
          .andThen(({ s, number }) =>
            ResultAsync.fromPromise(
              db
                .insert(screenplayVersions)
                .values({
                  screenplayId: s.id,
                  number,
                  content: "",
                  pageCount: 0,
                  createdBy: user.id,
                })
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.create", e),
            ).andThen((version) =>
              version
                ? ResultAsync.fromPromise(
                    db
                      .update(screenplays)
                      .set({ currentVersionId: version.id })
                      .where(eq(screenplays.id, s.id))
                      .then(() => stripYjsSnapshot(version)),
                    (e) => new DbError("versions.create.update-current", e),
                  )
                : errAsync(new VersionNotFoundError("new")),
            ),
          ),
      );
    },
  );

// ─── duplicateVersion ─────────────────────────────────────────────────────────

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

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((source) =>
            findScreenplay(db, source.screenplayId).map((s) => ({ source, s })),
          )
          .andThen(({ source, s }) =>
            assertCanEdit(db, s, user.id).map(() => ({ source, s })),
          )
          .andThen(({ source, s }) =>
            nextNumber(db, s.id).map((number) => ({ source, s, number })),
          )
          .andThen(({ source, s, number }) =>
            ResultAsync.fromPromise(
              db
                .insert(screenplayVersions)
                .values({
                  screenplayId: s.id,
                  number,
                  content: source.content,
                  pageCount: source.pageCount,
                  createdBy: user.id,
                })
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.duplicate", e),
            ).andThen((version) =>
              version
                ? ResultAsync.fromPromise(
                    db
                      .update(screenplays)
                      .set({ currentVersionId: version.id })
                      .where(eq(screenplays.id, s.id))
                      .then(() => stripYjsSnapshot(version)),
                    (e) => new DbError("versions.duplicate.update-current", e),
                  )
                : errAsync(new VersionNotFoundError("new")),
            ),
          ),
      );
    },
  );

// ─── renameVersion ────────────────────────────────────────────────────────────

export const renameVersion = createServerFn({ method: "POST" })
  .validator(RenameVersionInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        VersionView,
        VersionNotFoundError | ForbiddenError | ValidationError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findScreenplay(db, version.screenplayId).map((s) => ({
              version,
              s,
            })),
          )
          .andThen(({ version, s }) =>
            assertCanEdit(db, s, user.id).map(() => version),
          )
          .andThen((version) =>
            ResultAsync.fromPromise(
              db
                .update(screenplayVersions)
                .set({ label: data.label })
                .where(eq(screenplayVersions.id, version.id))
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.rename", e),
            ).andThen((row) =>
              row
                ? ok(stripYjsSnapshot(row))
                : err(new VersionNotFoundError(version.id)),
            ),
          ),
      );
    },
  );

// ─── switchToVersion ──────────────────────────────────────────────────────────

export const switchToVersion = createServerFn({ method: "POST" })
  .validator(SwitchVersionInput)
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

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findScreenplay(db, version.screenplayId).map((s) => ({
              version,
              s,
            })),
          )
          .andThen(({ version, s }) =>
            assertCanEdit(db, s, user.id).map(() => ({ version, s })),
          )
          .andThen(({ version, s }) =>
            ResultAsync.fromPromise(
              db
                .update(screenplays)
                .set({
                  currentVersionId: version.id,
                  pageCount: version.pageCount,
                  updatedAt: new Date(),
                })
                .where(eq(screenplays.id, s.id))
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.switch", e),
            ).andThen((row) => {
              if (!row) return err(new VersionNotFoundError(s.id));
              const { yjsState: _y, ...view } = row;
              return ok(view);
            }),
          ),
      );
    },
  );

// Legacy alias — spec 06b says `restoreVersion` becomes `switchToVersion`.
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
    > => switchToVersion({ data }),
  );

// ─── deleteVersion ────────────────────────────────────────────────────────────

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
        | ValidationError
        | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findScreenplay(db, version.screenplayId).map((s) => ({
              version,
              s,
            })),
          )
          .andThen(({ version, s }) =>
            assertCanEdit(db, s, user.id).map(() => ({ version, s })),
          )
          .andThen(({ version, s }) => {
            if (s.currentVersionId === version.id) {
              return errAsync(
                new ValidationError(
                  "versionId",
                  "cannot delete the current version — switch first",
                ),
              );
            }
            return ResultAsync.fromPromise(
              db
                .select({ count: sql<number>`count(*)::int` })
                .from(screenplayVersions)
                .where(eq(screenplayVersions.screenplayId, s.id))
                .then((rows) => rows[0]?.count ?? 0),
              (e) => new DbError("versions.delete.count", e),
            ).andThen((count) =>
              count <= 1
                ? errAsync(new CannotDeleteLastManualError())
                : okAsync(version),
            );
          })
          .andThen((version) =>
            ResultAsync.fromPromise(
              db
                .delete(screenplayVersions)
                .where(eq(screenplayVersions.id, version.id))
                .then(() => undefined),
              (e) => new DbError("versions.delete", e),
            ),
          ),
      );
    },
  );

// ─── saveVersionContent ───────────────────────────────────────────────────────

export const saveVersionContent = createServerFn({ method: "POST" })
  .validator(SaveVersionContentInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<VersionView, VersionNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await findVersion(db, data.versionId)
          .andThen((version) =>
            findScreenplay(db, version.screenplayId).map((s) => ({
              version,
              s,
            })),
          )
          .andThen(({ version, s }) =>
            assertCanEdit(db, s, user.id).map(() => version),
          )
          .andThen((version) =>
            ResultAsync.fromPromise(
              db
                .update(screenplayVersions)
                .set({
                  content: data.content,
                  pageCount: data.pageCount,
                })
                .where(eq(screenplayVersions.id, version.id))
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("versions.saveContent", e),
            ).andThen((row) =>
              row
                ? ok(stripYjsSnapshot(row))
                : err(new VersionNotFoundError(version.id)),
            ),
          ),
      );
    },
  );

// ─── Legacy alias: createManualVersion → duplicates current with label ────────
//
// Existing `VersionsList` still calls this. Block 5 replaces the UI with the
// new popover; until then we keep the endpoint functional by treating it as
// "duplicate the active version and label it".
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

      return toShape(
        await findScreenplay(db, data.screenplayId)
          .andThen((s) => assertCanEdit(db, s, user.id).map(() => s))
          .andThen((s) => nextNumber(db, s.id).map((number) => ({ s, number })))
          .andThen(({ s, number }) =>
            ResultAsync.fromPromise(
              db
                .insert(screenplayVersions)
                .values({
                  screenplayId: s.id,
                  number,
                  label: data.label,
                  content: s.content,
                  pageCount: s.pageCount,
                  createdBy: user.id,
                })
                .returning()
                .then((rows) => rows[0] ?? null),
              (e) => new DbError("createManualVersion", e),
            ).andThen((version) =>
              version
                ? ResultAsync.fromPromise(
                    db
                      .update(screenplays)
                      .set({ currentVersionId: version.id })
                      .where(eq(screenplays.id, s.id))
                      .then(() => stripYjsSnapshot(version)),
                    (e) => new DbError("createManualVersion.update-current", e),
                  )
                : errAsync(new VersionNotFoundError("new")),
            ),
          ),
      );
    },
  );
