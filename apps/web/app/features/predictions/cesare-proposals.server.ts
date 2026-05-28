import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ResultAsync, ok, err, okAsync, errAsync } from "neverthrow";
import { screenplayVersions, screenplays } from "@oh-writers/db/schema";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import { requireProjectAccess } from "~/server/access";
import type { ProjectAccessError } from "~/server/access";
import { DbError } from "@oh-writers/utils";
import { CesareError } from "./cesare.errors";
import {
  listScreenplayProposals,
  removeScreenplayProposal,
  type ProposedEdit,
  type DraftRevisionProposal,
} from "./cesare-screenplay-tools";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GetProposalsInput = z.object({
  screenplayId: z.string().uuid(),
});

const RemoveProposalInput = z.object({
  screenplayId: z.string().uuid(),
  proposalId: z.string(),
});

const PromoteDraftInput = z.object({
  versionId: z.string().uuid(),
});

const DeleteDraftInput = z.object({
  versionId: z.string().uuid(),
});

// ─── Errors ───────────────────────────────────────────────────────────────────

class DraftVersionNotFoundError {
  readonly _tag = "DraftVersionNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Draft version not found: ${id}`;
  }
}

type ProposalAccessError =
  | DraftVersionNotFoundError
  | ProjectAccessError
  | DbError
  | CesareError;

// ─── Helper: resolve screenplay to its projectId for access ───────────────────

const resolveScreenplayProject = (
  screenplayId: string,
): ResultAsync<string, DbError | CesareError> => {
  return ResultAsync.fromPromise(
    getDb().then((db) =>
      db
        .select({ projectId: screenplays.projectId })
        .from(screenplays)
        .where(eq(screenplays.id, screenplayId))
        .limit(1)
        .then((rows) => rows[0]?.projectId ?? null),
    ),
    (e) => new DbError("resolveScreenplayProject", e),
  ).andThen((projectId) =>
    projectId
      ? okAsync(projectId)
      : errAsync(
          new CesareError(
            `Screenplay ${screenplayId} not found or has no project`,
          ),
        ),
  );
};

// ─── getScreenplayProposals ───────────────────────────────────────────────────

export interface ProposalsView {
  readonly edits: ProposedEdit[];
  readonly drafts: DraftRevisionProposal[];
}

export const getScreenplayProposals = createServerFn({ method: "GET" })
  .validator(GetProposalsInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<ProposalsView, ProposalAccessError>> => {
      await requireUser();
      const projectResult = await resolveScreenplayProject(data.screenplayId);
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const db = await getDb();
      const accessResult = await requireProjectAccess(
        db,
        projectResult.value,
        "view",
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      const bucket = listScreenplayProposals(data.screenplayId);
      return toShape(ok(bucket));
    },
  );

// ─── removeProposal (used by accept/reject of edits) ──────────────────────────

export const removeScreenplayProposalFn = createServerFn({ method: "POST" })
  .validator(RemoveProposalInput)
  .handler(
    async ({ data }): Promise<ResultShape<void, ProposalAccessError>> => {
      await requireUser();
      const projectResult = await resolveScreenplayProject(data.screenplayId);
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const db = await getDb();
      const accessResult = await requireProjectAccess(
        db,
        projectResult.value,
        "edit",
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      removeScreenplayProposal(data.screenplayId, data.proposalId);
      return toShape(ok(undefined));
    },
  );

// ─── Draft version management ─────────────────────────────────────────────────

export const promoteDraftToActive = createServerFn({ method: "POST" })
  .validator(PromoteDraftInput)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<{ versionId: string }, ProposalAccessError>> => {
      const user = await requireUser();
      const db = await getDb();

      const versionRowResult = await ResultAsync.fromPromise(
        db
          .select()
          .from(screenplayVersions)
          .where(eq(screenplayVersions.id, data.versionId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        (e) => new DbError("promoteDraftToActive.select", e),
      );
      if (versionRowResult.isErr()) return toShape(err(versionRowResult.error));
      const version = versionRowResult.value;
      if (!version) {
        return toShape(err(new DraftVersionNotFoundError(data.versionId)));
      }
      if (!version.isDraft) {
        return toShape(err(new CesareError("Version is not a draft")));
      }

      const projectResult = await resolveScreenplayProject(
        version.screenplayId,
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const accessResult = await requireProjectAccess(
        db,
        projectResult.value,
        "edit",
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));

      const result = await ResultAsync.fromPromise(
        db.transaction(async (tx) => {
          await tx
            .update(screenplayVersions)
            .set({ isDraft: false })
            .where(eq(screenplayVersions.id, data.versionId));
          await tx
            .update(screenplays)
            .set({
              content: version.content,
              pageCount: version.pageCount,
              updatedAt: new Date(),
              breakdownStale: true,
              locationsStale: true,
              budgetStale: true,
              scheduleStale: true,
            })
            .where(eq(screenplays.id, version.screenplayId));
        }),
        (e) => new DbError("promoteDraftToActive.tx", e),
      );
      if (result.isErr()) return toShape(err(result.error));
      return toShape(ok({ versionId: data.versionId }));
    },
  );

export const discardDraftVersion = createServerFn({ method: "POST" })
  .validator(DeleteDraftInput)
  .handler(
    async ({ data }): Promise<ResultShape<void, ProposalAccessError>> => {
      await requireUser();
      const db = await getDb();

      const versionRowResult = await ResultAsync.fromPromise(
        db
          .select({
            id: screenplayVersions.id,
            screenplayId: screenplayVersions.screenplayId,
            isDraft: screenplayVersions.isDraft,
          })
          .from(screenplayVersions)
          .where(eq(screenplayVersions.id, data.versionId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        (e) => new DbError("discardDraftVersion.select", e),
      );
      if (versionRowResult.isErr()) return toShape(err(versionRowResult.error));
      const version = versionRowResult.value;
      if (!version) {
        return toShape(err(new DraftVersionNotFoundError(data.versionId)));
      }
      if (!version.isDraft) {
        return toShape(err(new CesareError("Version is not a draft")));
      }
      const projectResult = await resolveScreenplayProject(
        version.screenplayId,
      );
      if (projectResult.isErr()) return toShape(err(projectResult.error));
      const accessResult = await requireProjectAccess(
        db,
        projectResult.value,
        "edit",
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));

      const result = await ResultAsync.fromPromise(
        db
          .delete(screenplayVersions)
          .where(eq(screenplayVersions.id, data.versionId)),
        (e) => new DbError("discardDraftVersion.delete", e),
      );
      if (result.isErr()) return toShape(err(result.error));
      return toShape(ok(undefined));
    },
  );
