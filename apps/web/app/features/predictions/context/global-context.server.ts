import type { Db } from "~/server/db";
import type { GlobalContext } from "@oh-writers/domain";
import { loadFilmBible, BibleDistillError } from "../bible-distill.server";
import { ResultAsync, okAsync } from "neverthrow";
import { DbError } from "@oh-writers/utils";
import { projects } from "@oh-writers/db/schema";
import { eq } from "drizzle-orm";

export { BibleDistillError };

// ─── In-process memo cache ────────────────────────────────────────────────────
// projectId → { context, expiresAt }. Skips a DB round-trip for repeated calls
// within the same server process (e.g. two Cesare turns in quick succession).

const globalContextCache = new Map<
  string,
  { context: GlobalContext; expiresAt: number }
>();
const GLOBAL_CTX_TTL_MS = 60_000;

export const buildGlobalContext = (
  db: Db,
  projectId: string,
): ResultAsync<GlobalContext, DbError | BibleDistillError> => {
  const cached = globalContextCache.get(projectId);
  if (cached && cached.expiresAt > Date.now()) return okAsync(cached.context);

  return ResultAsync.fromPromise(
    db
      .select({
        title: projects.title,
        genre: projects.genre,
        format: projects.format,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) => new DbError("buildGlobalContext.project", e),
  )
    .andThen((project) => {
      if (!project) {
        return okAsync({
          projectTitle: "Senza titolo",
          genre: null,
          format: "feature",
          bible: null,
        } as GlobalContext);
      }

      return loadFilmBible(db, projectId)
        .map(
          (bible): GlobalContext => ({
            projectTitle: project.title,
            genre: project.genre ?? null,
            format: project.format,
            bible,
          }),
        )
        .orElse(
          (): ResultAsync<GlobalContext, never> =>
            okAsync({
              projectTitle: project.title,
              genre: project.genre ?? null,
              format: project.format,
              bible: null,
            }),
        );
    })
    .map((ctx) => {
      globalContextCache.set(projectId, {
        context: ctx,
        expiresAt: Date.now() + GLOBAL_CTX_TTL_MS,
      });
      return ctx;
    });
};

export const invalidateGlobalContext = (projectId: string): void => {
  globalContextCache.delete(projectId);
};
