import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync } from "neverthrow";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import {
  buildEditorialAdviceDecisionsBlock,
  DecidedEditorialAdviceStatusSchema,
  EditorialAdviceDecisionKeySchema,
  type EditorialAdviceDecision,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import { editorialAdviceDecisions } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import type { ProjectAccessError } from "~/server/access";

export class EditorialAdviceDecisionError {
  readonly _tag = "EditorialAdviceDecisionError" as const;
  readonly message: string;
  constructor(readonly cause: string) {
    this.message = `Editorial advice decision error: ${cause}`;
  }
}

// ─── Shared query (narrative + screenplay polish + the list server fn) ─────

const toDecision = (row: {
  docType: string;
  sceneId: string | null;
  area: string;
  anchorText: string;
  titleFingerprint: string;
  status: EditorialAdviceDecision["status"];
}): EditorialAdviceDecision => ({
  docType: row.docType,
  sceneId: row.sceneId,
  area: row.area,
  anchorText: row.anchorText,
  titleFingerprint: row.titleFingerprint,
  status: row.status,
});

const queryDecisions = (
  db: Db,
  projectId: string,
  docType: string,
  sceneId?: string,
) =>
  db.query.editorialAdviceDecisions.findMany({
    where: and(
      eq(editorialAdviceDecisions.projectId, projectId),
      eq(editorialAdviceDecisions.docType, docType),
      sceneId
        ? eq(editorialAdviceDecisions.sceneId, sceneId)
        : isNull(editorialAdviceDecisions.sceneId),
    ),
  });

/**
 * Reads decided editorial-advice for (projectId, docType[, sceneId]) and
 * renders the anti-repetition block Cesare receives before generating new
 * advice. `sceneId: undefined` scopes to doc-level decisions (sceneId IS NULL)
 * — used by narrative docs and by the whole-screenplay context alike.
 */
export const fetchEditorialAdviceDecisionsBlock = async (
  db: Db,
  projectId: string,
  docType: string,
  sceneId?: string,
): Promise<string> => {
  const rows = await queryDecisions(db, projectId, docType, sceneId);
  return buildEditorialAdviceDecisionsBlock(rows.map(toDecision));
};

// ─── List ───────────────────────────────────────────────────────────────────

const ListInput = z.object({
  projectId: z.string().uuid(),
  docType: z.string().min(1),
  sceneId: z.string().uuid().optional(),
});

export const listEditorialAdviceDecisions = createServerFn({ method: "GET" })
  .validator(ListInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        EditorialAdviceDecision[],
        EditorialAdviceDecisionError | ProjectAccessError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db }) =>
          ResultAsync.fromPromise(
            queryDecisions(db, data.projectId, data.docType, data.sceneId),
            (e) =>
              new EditorialAdviceDecisionError(
                e instanceof Error ? e.message : String(e),
              ),
          ).map((rows) => rows.map(toDecision)),
        ),
      ),
  );

// ─── Record (upsert) ────────────────────────────────────────────────────────

// Two partial unique indexes back this upsert (see the schema comment) because
// Postgres never matches NULL=NULL in a plain unique constraint — a single
// target covering the nullable sceneId would silently INSERT a duplicate row
// for every doc-level (sceneId=null) decision instead of updating it.
export const upsertEditorialAdviceDecision = (
  db: Db,
  projectId: string,
  key: {
    docType: string;
    sceneId: string | null;
    area: string;
    anchorText: string;
    titleFingerprint: string;
  },
  status: EditorialAdviceDecision["status"],
) =>
  db
    .insert(editorialAdviceDecisions)
    .values({
      projectId,
      docType: key.docType,
      sceneId: key.sceneId,
      area: key.area,
      anchorText: key.anchorText,
      titleFingerprint: key.titleFingerprint,
      status,
    })
    .onConflictDoUpdate(
      key.sceneId
        ? {
            target: [
              editorialAdviceDecisions.projectId,
              editorialAdviceDecisions.docType,
              editorialAdviceDecisions.sceneId,
              editorialAdviceDecisions.area,
              editorialAdviceDecisions.anchorText,
              editorialAdviceDecisions.titleFingerprint,
            ],
            targetWhere: isNotNull(editorialAdviceDecisions.sceneId),
            set: { status, updatedAt: new Date() },
          }
        : {
            target: [
              editorialAdviceDecisions.projectId,
              editorialAdviceDecisions.docType,
              editorialAdviceDecisions.area,
              editorialAdviceDecisions.anchorText,
              editorialAdviceDecisions.titleFingerprint,
            ],
            targetWhere: isNull(editorialAdviceDecisions.sceneId),
            set: { status, updatedAt: new Date() },
          },
    );

const RecordInput = z.object({
  projectId: z.string().uuid(),
  key: EditorialAdviceDecisionKeySchema,
  status: DecidedEditorialAdviceStatusSchema,
});

export const recordEditorialAdviceDecision = createServerFn({
  method: "POST",
})
  .validator(RecordInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, EditorialAdviceDecisionError | ProjectAccessError>
    > =>
      toShape(
        await withProjectAccess(data.projectId, "edit", ({ db }) =>
          ResultAsync.fromPromise(
            upsertEditorialAdviceDecision(
              db,
              data.projectId,
              data.key,
              data.status,
            ),
            (e) =>
              new EditorialAdviceDecisionError(
                e instanceof Error ? e.message : String(e),
              ),
          ).map(() => undefined),
        ),
      ),
  );
