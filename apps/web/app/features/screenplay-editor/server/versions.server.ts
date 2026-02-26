import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import type { Result } from "neverthrow";
import { eq, and, desc, asc, count } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { screenplayVersions, screenplays } from "@oh-writers/db/schema";
import type { ScreenplayVersion } from "@oh-writers/db";
import { getUser } from "~/server/context";
import {
  ListVersionsInput,
  GetVersionInput,
  CreateManualVersionInput,
  RestoreVersionInput,
  DeleteVersionInput,
} from "../screenplay-versions.schema";
import type { VersionView } from "../screenplay-versions.schema";
import {
  VersionNotFoundError,
  CannotDeleteLastManualError,
  ForbiddenError,
  DbError,
} from "../screenplay-versions.errors";
import type {
  OkShape,
  ErrShape,
  ResultShape,
  ScreenplayView,
} from "./screenplay.server";

export type { VersionView };

// ─── Auth helper ──────────────────────────────────────────────────────────────

const requireUser = async () => {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
};

// ─── DB helper ────────────────────────────────────────────────────────────────

const getDb = async () => {
  const { db } = await import("@oh-writers/db");
  return db;
};

// Strip binary yjsSnapshot before sending to client
const stripYjsSnapshot = ({
  yjsSnapshot: _,
  ...rest
}: ScreenplayVersion): VersionView => rest as VersionView;

const toShape = <T, E>(result: Result<T, E>): ResultShape<T, E> =>
  result.isOk()
    ? { isOk: true as const, value: result.value }
    : { isOk: false as const, error: result.error };

// Maximum number of auto-snapshots to retain per screenplay (FIFO)
const MAX_AUTO_SNAPSHOTS = 50;

// ─── List versions ────────────────────────────────────────────────────────────

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

      const screenplayResult = await ResultAsync.fromPromise(
        db.query.screenplays
          .findFirst({ where: eq(screenplays.id, data.screenplayId) })
          .then((row) => row ?? null),
        (e) => new DbError("createManualVersion.find", e),
      );
      if (screenplayResult.isErr()) return toShape(err(screenplayResult.error));
      const screenplay = screenplayResult.value;
      if (!screenplay)
        return toShape(err(new VersionNotFoundError(data.screenplayId)));

      return toShape(
        await ResultAsync.fromPromise(
          db
            .insert(screenplayVersions)
            .values({
              screenplayId: data.screenplayId,
              label: data.label,
              content: screenplay.content,
              pageCount: screenplay.pageCount,
              isAuto: false,
              createdBy: user.id,
            })
            .returning()
            .then((rows) => rows[0]),
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

      const versionResult = await ResultAsync.fromPromise(
        db.query.screenplayVersions
          .findFirst({ where: eq(screenplayVersions.id, data.versionId) })
          .then((row) => row ?? null),
        (e) => new DbError("restoreVersion.findVersion", e),
      );
      if (versionResult.isErr()) return toShape(err(versionResult.error));
      const version = versionResult.value;
      if (!version)
        return toShape(err(new VersionNotFoundError(data.versionId)));

      const screenplayResult = await ResultAsync.fromPromise(
        db.query.screenplays
          .findFirst({ where: eq(screenplays.id, version.screenplayId) })
          .then((row) => row ?? null),
        (e) => new DbError("restoreVersion.findScreenplay", e),
      );
      if (screenplayResult.isErr()) return toShape(err(screenplayResult.error));
      const screenplay = screenplayResult.value;
      if (!screenplay)
        return toShape(err(new VersionNotFoundError(version.screenplayId)));

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            // Safety auto-save: snapshot current state before restoring
            await tx.insert(screenplayVersions).values({
              screenplayId: screenplay.id,
              label: null,
              content: screenplay.content,
              pageCount: screenplay.pageCount,
              isAuto: true,
              createdBy: user.id,
            });

            const [updated] = await tx
              .update(screenplays)
              .set({
                content: version.content,
                pageCount: version.pageCount,
                updatedAt: new Date(),
              })
              .where(eq(screenplays.id, screenplay.id))
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
      await requireUser();
      const db = await getDb();

      const versionResult = await ResultAsync.fromPromise(
        db.query.screenplayVersions
          .findFirst({ where: eq(screenplayVersions.id, data.versionId) })
          .then((row) => row ?? null),
        (e) => new DbError("deleteVersion.find", e),
      );
      if (versionResult.isErr()) return toShape(err(versionResult.error));
      const version = versionResult.value;
      if (!version)
        return toShape(err(new VersionNotFoundError(data.versionId)));

      // Guard: cannot delete the only manual version
      if (!version.isAuto) {
        const countResult = await ResultAsync.fromPromise(
          db
            .select({ value: count() })
            .from(screenplayVersions)
            .where(
              and(
                eq(screenplayVersions.screenplayId, version.screenplayId),
                eq(screenplayVersions.isAuto, false),
              ),
            )
            .then((rows) => rows[0]?.value ?? 0),
          (e) => new DbError("deleteVersion.count", e),
        );
        if (countResult.isErr()) return toShape(err(countResult.error));
        if (countResult.value <= 1)
          return toShape(err(new CannotDeleteLastManualError()));
      }

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

// ─── Auto-versioning helper (used by saveScreenplay) ─────────────────────────

/**
 * Creates an auto-snapshot if ≥5 minutes have elapsed since the last one.
 * Enforces the FIFO limit of MAX_AUTO_SNAPSHOTS per screenplay.
 * Called inside the same DB transaction as saveScreenplay.
 */
export const maybeCreateAutoVersion = async (
  tx: Awaited<ReturnType<typeof getDb>>,
  screenplayId: string,
  content: string,
  pageCount: number,
  userId: string,
): Promise<void> => {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  const latest = await tx.query.screenplayVersions.findFirst({
    where: and(
      eq(screenplayVersions.screenplayId, screenplayId),
      eq(screenplayVersions.isAuto, true),
    ),
    orderBy: [desc(screenplayVersions.createdAt)],
  });

  const now = Date.now();
  const needsSnapshot =
    !latest || now - latest.createdAt.getTime() >= FIVE_MINUTES_MS;

  if (!needsSnapshot) return;

  // Count current auto-snapshots; delete oldest if at the limit
  const autoCount = await tx
    .select({ value: count() })
    .from(screenplayVersions)
    .where(
      and(
        eq(screenplayVersions.screenplayId, screenplayId),
        eq(screenplayVersions.isAuto, true),
      ),
    )
    .then((rows) => rows[0]?.value ?? 0);

  if (autoCount >= MAX_AUTO_SNAPSHOTS) {
    const oldest = await tx.query.screenplayVersions.findFirst({
      where: and(
        eq(screenplayVersions.screenplayId, screenplayId),
        eq(screenplayVersions.isAuto, true),
      ),
      orderBy: [asc(screenplayVersions.createdAt)],
    });
    if (oldest) {
      await tx
        .delete(screenplayVersions)
        .where(eq(screenplayVersions.id, oldest.id));
    }
  }

  await tx.insert(screenplayVersions).values({
    screenplayId,
    label: null,
    content,
    pageCount,
    isAuto: true,
    createdBy: userId,
  });
};
