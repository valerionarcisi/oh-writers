import { ResultAsync } from "neverthrow";
import { and, eq } from "drizzle-orm";
import { db } from "@oh-writers/db";
import {
  documents,
  projects,
  screenplays,
  screenplayBranches,
  teamMembers,
} from "@oh-writers/db/schema";
import { canViewProject, type ProjectAccessContext } from "@oh-writers/utils";
import type { TeamRole } from "@oh-writers/domain";
import type { ParsedRoom } from "./room-id.js";

export { parseRoomId, type ParsedRoom, type RoomKind } from "./room-id.js";

export class RoomAccessError {
  readonly _tag = "RoomAccessError";
  constructor(
    readonly reason: "not-found" | "db",
    readonly cause?: unknown,
  ) {}
}

const projectIdForRoom = (
  room: ParsedRoom,
): ResultAsync<string | null, RoomAccessError> => {
  const lookup = async (): Promise<string | null> => {
    switch (room.kind) {
      case "screenplay": {
        const row = await db.query.screenplays.findFirst({
          where: eq(screenplays.id, room.id),
          columns: { projectId: true },
        });
        return row?.projectId ?? null;
      }
      case "document": {
        const row = await db.query.documents.findFirst({
          where: eq(documents.id, room.id),
          columns: { projectId: true },
        });
        return row?.projectId ?? null;
      }
      case "branch": {
        const branch = await db.query.screenplayBranches.findFirst({
          where: eq(screenplayBranches.id, room.id),
          columns: { screenplayId: true },
        });
        if (!branch) return null;
        const screenplay = await db.query.screenplays.findFirst({
          where: eq(screenplays.id, branch.screenplayId),
          columns: { projectId: true },
        });
        return screenplay?.projectId ?? null;
      }
    }
  };

  return ResultAsync.fromPromise(
    lookup(),
    (e) => new RoomAccessError("db", e),
  );
};

export interface RoomAccess {
  projectId: string;
  role: TeamRole | null;
  canView: boolean;
  canWrite: boolean;
}

/**
 * Outcome of an access check. We distinguish "the entity does not exist"
 * (→ 4004) from "it exists but you can't see it" (→ 4003) so the close code is
 * meaningful, and never leak existence: a non-member of a real project still
 * gets `forbidden`, only a genuinely missing row is `not-found`.
 */
export type RoomAccessOutcome =
  | { kind: "ok"; access: RoomAccess }
  | { kind: "not-found" }
  | { kind: "forbidden" };

/**
 * Resolve the user's effective role on the project that owns the room, reusing
 * the same predicates the web server functions use so the two can never drift.
 * `role` is null for a personal-owner (no team) — `canWrite`/`canView` already
 * fold that case in, so callers gate on those, not on `role`.
 */
export const resolveRoomAccess = (
  room: ParsedRoom,
  userId: string,
): ResultAsync<RoomAccessOutcome, RoomAccessError> =>
  projectIdForRoom(room).andThen((projectId) => {
    if (!projectId) {
      return ResultAsync.fromSafePromise(
        Promise.resolve<RoomAccessOutcome>({ kind: "not-found" }),
      );
    }

    const load = async (): Promise<RoomAccessOutcome> => {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { ownerId: true, teamId: true },
      });
      if (!project) return { kind: "not-found" };

      const isPersonalOwner =
        project.teamId === null && project.ownerId === userId;

      let teamRole: TeamRole | null = null;
      if (project.teamId !== null) {
        const membership = await db.query.teamMembers.findFirst({
          where: and(
            eq(teamMembers.teamId, project.teamId),
            eq(teamMembers.userId, userId),
          ),
          columns: { role: true },
        });
        teamRole = membership?.role ?? null;
      }

      const ctx: ProjectAccessContext = { isPersonalOwner, teamRole };
      if (!canViewProject(ctx)) return { kind: "forbidden" };

      return {
        kind: "ok",
        access: {
          projectId,
          role: teamRole,
          canView: true,
          canWrite:
            isPersonalOwner || teamRole === "owner" || teamRole === "editor",
        },
      };
    };

    return ResultAsync.fromPromise(load(), (e) => new RoomAccessError("db", e));
  });
