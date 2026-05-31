// apps/web/app/features/documents/server/narrative-progress.server.ts
//
// Spec 50 (Part 2) — "the documents ARE the state". This read returns, for a
// project, which narrative entities currently hold content. It is the only I/O
// the next-step suggestion needs; the decision itself is the pure
// `nextNarrativeStep` (features/predictions/narrative-next-step.ts).
//
// Content existence is "the live text is non-empty after trimming". Narrative
// documents are created lazily with empty content (see documents.server.ts), so
// a row existing is NOT proof of content — we read the live content and check it
// is non-blank. The screenplay step is satisfied when the screenplay row holds
// non-empty content.

import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync, okAsync } from "neverthrow";
import { eq, inArray } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import {
  documents,
  documentVersions,
  screenplays,
} from "@oh-writers/db/schema";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import type { Db } from "~/server/db";
import { withProjectAccess } from "~/server/pipeline";
import type { ProjectAccessError } from "~/server/access";
import { DbError } from "../documents.errors";

// ─── Output shape ──────────────────────────────────────────────────────────
//
// One boolean per chain entity. Mirrors `NarrativePresence` in the predictions
// feature structurally so the pure `nextNarrativeStep` consumes it directly.

export const NarrativePresenceSchema = z.object({
  logline: z.boolean(),
  soggetto: z.boolean(),
  synopsis: z.boolean(),
  outline: z.boolean(),
  treatment: z.boolean(),
  screenplay: z.boolean(),
});

export type NarrativePresenceShape = z.infer<typeof NarrativePresenceSchema>;

const hasContent = (value: string | null | undefined): boolean =>
  (value ?? "").trim().length > 0;

/**
 * Resolves the live content for each narrative document of a project: the active
 * version row when present, falling back to `documents.content`. Returns the set
 * of document types whose live content is non-empty.
 */
const writtenDocumentTypes = (
  db: Db,
  projectId: string,
): ResultAsync<ReadonlySet<DocumentType>, DbError> =>
  ResultAsync.fromPromise(
    db.query.documents.findMany({
      where: eq(documents.projectId, projectId),
    }),
    (e) => new DbError("narrativeProgress.documents", e),
  ).andThen((rows) => {
    const versionIds = rows
      .map((r) => r.currentVersionId)
      .filter((v): v is string => v !== null);
    const versionsResult: ResultAsync<
      ReadonlyArray<{ id: string; content: string }>,
      DbError
    > = versionIds.length
      ? ResultAsync.fromPromise(
          db.query.documentVersions.findMany({
            where: inArray(documentVersions.id, versionIds),
          }),
          (e) => new DbError("narrativeProgress.versions", e),
        )
      : okAsync([]);

    return versionsResult.map((versions) => {
      const contentByVersionId = new Map(
        versions.map((v) => [v.id, v.content] as const),
      );
      const written = new Set<DocumentType>();
      for (const row of rows) {
        const live = row.currentVersionId
          ? (contentByVersionId.get(row.currentVersionId) ?? row.content)
          : row.content;
        if (hasContent(live)) written.add(row.type as DocumentType);
      }
      return written;
    });
  });

const screenplayHasContent = (
  db: Db,
  projectId: string,
): ResultAsync<boolean, DbError> =>
  ResultAsync.fromPromise(
    db.query.screenplays
      .findFirst({ where: eq(screenplays.projectId, projectId) })
      .then((row) => row ?? null),
    (e) => new DbError("narrativeProgress.screenplay", e),
  ).map((row) => row !== null && hasContent(row.content));

export const getNarrativeProgress = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<NarrativePresenceShape, DbError | ProjectAccessError>
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db, access }) =>
          writtenDocumentTypes(db, access.project.id).andThen((writtenDocs) =>
            screenplayHasContent(db, access.project.id).map(
              (hasScreenplay) => ({
                logline: writtenDocs.has(DocumentTypes.LOGLINE),
                soggetto: writtenDocs.has(DocumentTypes.SOGGETTO),
                synopsis: writtenDocs.has(DocumentTypes.SYNOPSIS),
                outline: writtenDocs.has(DocumentTypes.OUTLINE),
                treatment: writtenDocs.has(DocumentTypes.TREATMENT),
                screenplay: hasScreenplay,
              }),
            ),
          ),
        ),
      ),
  );

export const narrativeProgressQueryKey = (projectId: string) =>
  ["narrative-progress", projectId] as const;

export const narrativeProgressQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: narrativeProgressQueryKey(projectId),
    queryFn: () => getNarrativeProgress({ data: { projectId } }),
  });
