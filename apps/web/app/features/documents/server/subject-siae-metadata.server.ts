import { createServerFn } from "@tanstack/start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ok, ResultAsync } from "neverthrow";
import { projects } from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { getDb, type Db } from "~/server/db";
import { requireProjectAccess } from "~/server/access";
import { SiaeMetadataSchema, type SiaeMetadata } from "../documents.schema";
import { DbError, ForbiddenError } from "../documents.errors";

type LoadError = ForbiddenError | DbError;
type SaveError = ForbiddenError | DbError;

const readSiaeMetadata = (
  db: Db,
  projectId: string,
): ResultAsync<SiaeMetadata | null, DbError> =>
  ResultAsync.fromPromise(
    db.query.projects
      .findFirst({ where: eq(projects.id, projectId) })
      .then((row) => {
        if (!row?.siaeMetadata) return null;
        const parsed = SiaeMetadataSchema.safeParse(row.siaeMetadata);
        return parsed.success ? parsed.data : null;
      }),
    (e) => new DbError("siae-metadata/load", e),
  );

const toLoadError = (e: { _tag: string }): LoadError =>
  e._tag === "ProjectNotFoundError"
    ? new ForbiddenError("access project")
    : (e as LoadError);

export const loadSiaeMetadata = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({ data }): Promise<ResultShape<SiaeMetadata | null, LoadError>> => {
      const db = await getDb();
      return toShape(
        await requireProjectAccess(db, data.projectId, "view")
          .mapErr(toLoadError)
          .andThen(() => readSiaeMetadata(db, data.projectId)),
      );
    },
  );

export const saveSiaeMetadata = createServerFn({ method: "POST" })
  .validator(
    z.object({ projectId: z.string().uuid(), metadata: SiaeMetadataSchema }),
  )
  .handler(async ({ data }): Promise<ResultShape<void, SaveError>> => {
    const db = await getDb();
    return toShape(
      await requireProjectAccess(db, data.projectId, "edit")
        .mapErr(toLoadError)
        .andThen(() =>
          ResultAsync.fromPromise(
            db
              .update(projects)
              .set({
                siaeMetadata: data.metadata as Record<
                  string,
                  NonNullable<unknown>
                >,
                updatedAt: new Date(),
              })
              .where(eq(projects.id, data.projectId))
              .then(() => ok<void, SaveError>(undefined).value),
            (e) => new DbError("siae-metadata/save", e),
          ),
        ),
    );
  });
