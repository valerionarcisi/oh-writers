import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync, okAsync, errAsync } from "neverthrow";
import { eq, and, count } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import {
  teams,
  teamMembers,
  teamInvitations,
  users,
} from "@oh-writers/db/schema";
import type { Team, TeamMember, TeamInvitation } from "@oh-writers/db/schema";
import { sendTeamInviteEmail } from "@oh-writers/auth";
import { requireUser, getUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { Db } from "~/server/db";
import { getMembership } from "~/server/permissions";
import {
  TeamNotFoundError,
  TeamMemberNotFoundError,
  InvitationNotFoundError,
  InvitationExpiredError,
  InvitationAlreadyAcceptedError,
  AlreadyMemberError,
  LastOwnerError,
  SlugConflictError,
  ForbiddenError,
  DbError,
} from "../teams.errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TeamMemberWithUser = TeamMember & {
  userName: string | null;
  userEmail: string;
  userAvatarUrl: string | null;
};

export type TeamWithMembers = Team & {
  members: TeamMemberWithUser[];
  invitations: TeamInvitation[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "team";

const generateToken = (): string => randomBytes(32).toString("hex");

const INVITATION_EXPIRY_DAYS = 7;

const requireTeamOwner = (
  db: Db,
  teamId: string,
  userId: string,
): ResultAsync<TeamMember, ForbiddenError | DbError> =>
  getMembership(db, teamId, userId).andThen((member) => {
    if (!member || member.role !== "owner")
      return errAsync(new ForbiddenError("team owner required"));
    return okAsync(member);
  });

const countOwners = (db: Db, teamId: string): ResultAsync<number, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ value: count() })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "owner")))
      .then((rows) => rows[0]?.value ?? 0),
    (e) => new DbError("countOwners", e),
  );

const loadTeamBySlug = (
  db: Db,
  slug: string,
): ResultAsync<Team, TeamNotFoundError | DbError> =>
  ResultAsync.fromPromise(
    db.query.teams
      .findFirst({ where: eq(teams.slug, slug) })
      .then((row) => row ?? null),
    (e) => new DbError("loadTeamBySlug", e),
  ).andThen((row) => (row ? ok(row) : err(new TeamNotFoundError(slug))));

const loadTeamById = (
  db: Db,
  teamId: string,
): ResultAsync<Team, TeamNotFoundError | DbError> =>
  ResultAsync.fromPromise(
    db.query.teams
      .findFirst({ where: eq(teams.id, teamId) })
      .then((row) => row ?? null),
    (e) => new DbError("loadTeamById", e),
  ).andThen((row) => (row ? ok(row) : err(new TeamNotFoundError(teamId))));

// ─── createTeam ───────────────────────────────────────────────────────────────

export const createTeam = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().min(1).max(100) }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<Team, SlugConflictError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const slug = toSlug(data.name);

      const existingResult = await ResultAsync.fromPromise(
        db.query.teams
          .findFirst({ where: eq(teams.slug, slug) })
          .then((row) => row ?? null),
        (e) => new DbError("createTeam.checkSlug", e),
      );
      if (existingResult.isErr()) return toShape(err(existingResult.error));
      if (existingResult.value)
        return toShape(err(new SlugConflictError(slug)));

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const [team] = await tx
              .insert(teams)
              .values({
                name: data.name,
                slug,
                createdBy: user.id,
              })
              .returning();

            if (!team) throw new Error("Insert returned no rows");

            await tx.insert(teamMembers).values({
              teamId: team.id,
              userId: user.id,
              role: "owner",
              invitedBy: null,
            });

            return team;
          }),
          (e) => new DbError("createTeam", e),
        ),
      );
    },
  );

// ─── getTeam ──────────────────────────────────────────────────────────────────

export const getTeam = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<TeamWithMembers, TeamNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await loadTeamBySlug(db, data.slug).andThen((team) =>
          getMembership(db, team.id, user.id).andThen((member) => {
            if (!member) return errAsync(new ForbiddenError("view team"));
            return ResultAsync.fromPromise(
              Promise.all([
                db
                  .select({
                    id: teamMembers.id,
                    teamId: teamMembers.teamId,
                    userId: teamMembers.userId,
                    role: teamMembers.role,
                    invitedBy: teamMembers.invitedBy,
                    joinedAt: teamMembers.joinedAt,
                    userName: users.name,
                    userEmail: users.email,
                    userAvatarUrl: users.avatarUrl,
                  })
                  .from(teamMembers)
                  .innerJoin(users, eq(teamMembers.userId, users.id))
                  .where(eq(teamMembers.teamId, team.id)),
                db
                  .select()
                  .from(teamInvitations)
                  .where(eq(teamInvitations.teamId, team.id)),
              ]),
              (e) => new DbError("getTeam.related", e),
            ).map(([members, invitations]) => ({
              ...team,
              members,
              invitations,
            }));
          }),
        ),
      );
    },
  );

export const teamQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["teams", slug] as const,
    queryFn: () => getTeam({ data: { slug } }),
  });

// ─── listMyTeams ──────────────────────────────────────────────────────────────

export const listMyTeams = createServerFn({ method: "GET" }).handler(
  async (): Promise<Team[]> => {
    const user = await requireUser();
    const db = await getDb();

    return ResultAsync.fromPromise(
      db
        .select({ team: teams })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(eq(teamMembers.userId, user.id))
        .then((rows) => rows.map((r) => r.team)),
      (e) => new DbError("listMyTeams", e),
    ).match(
      (rows) => rows,
      (error) => {
        throw error;
      },
    );
  },
);

export const myTeamsQueryOptions = () =>
  queryOptions({
    queryKey: ["teams", "mine"] as const,
    queryFn: () => listMyTeams(),
  });

// ─── updateTeam ───────────────────────────────────────────────────────────────

export const updateTeam = createServerFn({ method: "POST" })
  .validator(
    z.object({
      teamId: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      avatarUrl: z.string().url().nullable().optional(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<Team, TeamNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await requireTeamOwner(db, data.teamId, user.id).andThen(() =>
          ResultAsync.fromPromise(
            db
              .update(teams)
              .set({
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.avatarUrl !== undefined
                  ? { avatarUrl: data.avatarUrl }
                  : {}),
                updatedAt: new Date(),
              })
              .where(eq(teams.id, data.teamId))
              .returning()
              .then((rows) => rows[0] ?? null),
            (e) => new DbError("updateTeam", e),
          ).andThen((updated) =>
            updated ? ok(updated) : err(new TeamNotFoundError(data.teamId)),
          ),
        ),
      );
    },
  );

// ─── deleteTeam ───────────────────────────────────────────────────────────────

export const deleteTeam = createServerFn({ method: "POST" })
  .validator(z.object({ teamId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, TeamNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await requireTeamOwner(db, data.teamId, user.id).andThen(() =>
          ResultAsync.fromPromise(
            db
              .delete(teams)
              .where(eq(teams.id, data.teamId))
              .then(() => undefined),
            (e) => new DbError("deleteTeam", e),
          ),
        ),
      );
    },
  );

// ─── inviteMember ─────────────────────────────────────────────────────────────

export const inviteMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      teamId: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(["owner", "editor", "viewer"]),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<TeamInvitation, AlreadyMemberError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await requireTeamOwner(db, data.teamId, user.id).andThen(() =>
          ResultAsync.fromPromise(
            db.query.teamMembers
              .findFirst({
                where: and(eq(teamMembers.teamId, data.teamId)),
                with: {
                  // We need to join via users table to check email.
                  // Since teamMembers doesn't have email, we check teamInvitations instead.
                },
              })
              .then(() => null),
            (e) => new DbError("inviteMember.checkExisting", e),
          )
            // Check if there's already a pending invitation for this email
            .andThen(() =>
              ResultAsync.fromPromise(
                db.query.teamInvitations
                  .findFirst({
                    where: and(
                      eq(teamInvitations.teamId, data.teamId),
                      eq(teamInvitations.email, data.email),
                    ),
                  })
                  .then((row) => row ?? null),
                (e) => new DbError("inviteMember.checkInvitation", e),
              ),
            )
            .andThen((existingInvite) => {
              if (existingInvite && !existingInvite.acceptedAt)
                return errAsync(new AlreadyMemberError(data.email));
              return okAsync(null);
            })
            .andThen(() => {
              const token = generateToken();
              const expiresAt = new Date(
                Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
              );

              return ResultAsync.fromPromise(
                db
                  .insert(teamInvitations)
                  .values({
                    teamId: data.teamId,
                    email: data.email,
                    role: data.role,
                    token,
                    invitedBy: user.id,
                    expiresAt,
                  })
                  .returning()
                  .then(async (rows) => {
                    const inv = rows[0];
                    if (!inv) throw new Error("Insert returned no rows");
                    const origin =
                      process.env["APP_ORIGIN"] ?? "http://localhost:3000";
                    const url = `${origin}/invite/${token}`;
                    console.info(`[TEAM INVITE] ${url}`);
                    // Best-effort: sendTeamInviteEmail never throws (see
                    // mailer.ts) so an SMTP outage can't turn this insert into
                    // a 500 — the invitation row already exists and the link
                    // above is always available as a fallback.
                    const team = await db.query.teams.findFirst({
                      where: eq(teams.id, data.teamId),
                    });
                    await sendTeamInviteEmail({
                      to: data.email,
                      teamName: team?.name ?? "Oh Writers",
                      inviterName: user.name,
                      url,
                    });
                    return inv;
                  }),
                (e) => new DbError("inviteMember.insert", e),
              );
            }),
        ),
      );
    },
  );

// ─── resendInvite ─────────────────────────────────────────────────────────────

export const resendInvite = createServerFn({ method: "POST" })
  .validator(z.object({ invitationId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        TeamInvitation,
        InvitationNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const invResult = await ResultAsync.fromPromise(
        db.query.teamInvitations
          .findFirst({ where: eq(teamInvitations.id, data.invitationId) })
          .then((row) => row ?? null),
        (e) => new DbError("resendInvite.load", e),
      );
      if (invResult.isErr()) return toShape(err(invResult.error));
      const invitation = invResult.value;
      if (!invitation)
        return toShape(err(new InvitationNotFoundError(data.invitationId)));

      return toShape(
        await requireTeamOwner(db, invitation.teamId, user.id).andThen(() => {
          const expiresAt = new Date(
            Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
          );
          return ResultAsync.fromPromise(
            db
              .update(teamInvitations)
              .set({ expiresAt })
              .where(eq(teamInvitations.id, data.invitationId))
              .returning()
              .then(async (rows) => {
                const inv = rows[0];
                if (!inv) throw new Error("Update returned no rows");
                const origin =
                  process.env["APP_ORIGIN"] ?? "http://localhost:3000";
                const url = `${origin}/invite/${inv.token}`;
                console.info(`[TEAM INVITE] ${url}`);
                const team = await db.query.teams.findFirst({
                  where: eq(teams.id, inv.teamId),
                });
                await sendTeamInviteEmail({
                  to: inv.email,
                  teamName: team?.name ?? "Oh Writers",
                  inviterName: user.name,
                  url,
                });
                return inv;
              }),
            (e) => new DbError("resendInvite.update", e),
          );
        }),
      );
    },
  );

// ─── revokeInvite ─────────────────────────────────────────────────────────────

export const revokeInvite = createServerFn({ method: "POST" })
  .validator(z.object({ invitationId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, InvitationNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const invResult = await ResultAsync.fromPromise(
        db.query.teamInvitations
          .findFirst({ where: eq(teamInvitations.id, data.invitationId) })
          .then((row) => row ?? null),
        (e) => new DbError("revokeInvite.load", e),
      );
      if (invResult.isErr()) return toShape(err(invResult.error));
      const invitation = invResult.value;
      if (!invitation)
        return toShape(err(new InvitationNotFoundError(data.invitationId)));

      return toShape(
        await requireTeamOwner(db, invitation.teamId, user.id).andThen(() =>
          ResultAsync.fromPromise(
            db
              .delete(teamInvitations)
              .where(eq(teamInvitations.id, data.invitationId))
              .then(() => undefined),
            (e) => new DbError("revokeInvite.delete", e),
          ),
        ),
      );
    },
  );

// ─── acceptInvite ─────────────────────────────────────────────────────────────

export const acceptInvite = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        TeamMember,
        | InvitationNotFoundError
        | InvitationExpiredError
        | InvitationAlreadyAcceptedError
        | AlreadyMemberError
        | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const invResult = await ResultAsync.fromPromise(
        db.query.teamInvitations
          .findFirst({ where: eq(teamInvitations.token, data.token) })
          .then((row) => row ?? null),
        (e) => new DbError("acceptInvite.load", e),
      );
      if (invResult.isErr()) return toShape(err(invResult.error));
      const invitation = invResult.value;
      if (!invitation)
        return toShape(err(new InvitationNotFoundError(data.token)));
      if (invitation.acceptedAt)
        return toShape(err(new InvitationAlreadyAcceptedError()));
      if (invitation.expiresAt < new Date())
        return toShape(err(new InvitationExpiredError()));

      // Check if user is already a member
      const memberResult = await getMembership(db, invitation.teamId, user.id);
      if (memberResult.isErr()) return toShape(err(memberResult.error));
      if (memberResult.value)
        return toShape(err(new AlreadyMemberError(user.email)));

      return toShape(
        await ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const [member] = await tx
              .insert(teamMembers)
              .values({
                teamId: invitation.teamId,
                userId: user.id,
                role: invitation.role,
                invitedBy: invitation.invitedBy,
              })
              .returning();

            if (!member) throw new Error("Insert returned no rows");

            await tx
              .update(teamInvitations)
              .set({ acceptedAt: new Date() })
              .where(eq(teamInvitations.id, invitation.id));

            return member;
          }),
          (e) => new DbError("acceptInvite", e),
        ),
      );
    },
  );

// ─── getInviteByToken ─────────────────────────────────────────────────────────

export const getInviteByToken = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { invitation: TeamInvitation; team: Team },
        InvitationNotFoundError | TeamNotFoundError | DbError
      >
    > => {
      const db = await getDb();

      const invResult = await ResultAsync.fromPromise(
        db.query.teamInvitations
          .findFirst({ where: eq(teamInvitations.token, data.token) })
          .then((row) => row ?? null),
        (e) => new DbError("getInviteByToken", e),
      );
      if (invResult.isErr()) return toShape(err(invResult.error));
      const invitation = invResult.value;
      if (!invitation)
        return toShape(err(new InvitationNotFoundError(data.token)));

      return toShape(
        await loadTeamById(db, invitation.teamId).map((team) => ({
          invitation,
          team,
        })),
      );
    },
  );

export const inviteByTokenQueryOptions = (token: string) =>
  queryOptions({
    queryKey: ["invite", token] as const,
    queryFn: () => getInviteByToken({ data: { token } }),
  });

// ─── updateMemberRole ─────────────────────────────────────────────────────────

export const updateMemberRole = createServerFn({ method: "POST" })
  .validator(
    z.object({
      teamId: z.string().uuid(),
      userId: z.string(),
      role: z.enum(["owner", "editor", "viewer"]),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        TeamMember,
        TeamMemberNotFoundError | LastOwnerError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      if (data.userId === user.id)
        return toShape(err(new ForbiddenError("cannot change own role")));

      return toShape(
        await requireTeamOwner(db, data.teamId, user.id).andThen(() =>
          countOwners(db, data.teamId).andThen((ownerCount) =>
            getMembership(db, data.teamId, data.userId).andThen((member) => {
              if (!member)
                return errAsync(
                  new TeamMemberNotFoundError(data.teamId, data.userId),
                );
              if (
                member.role === "owner" &&
                data.role !== "owner" &&
                ownerCount <= 1
              )
                return errAsync(new LastOwnerError());
              return ResultAsync.fromPromise(
                db
                  .update(teamMembers)
                  .set({ role: data.role })
                  .where(
                    and(
                      eq(teamMembers.teamId, data.teamId),
                      eq(teamMembers.userId, data.userId),
                    ),
                  )
                  .returning()
                  .then((rows) => {
                    const m = rows[0];
                    if (!m) throw new Error("Update returned no rows");
                    return m;
                  }),
                (e) => new DbError("updateMemberRole", e),
              );
            }),
          ),
        ),
      );
    },
  );

// ─── removeMember ─────────────────────────────────────────────────────────────

export const removeMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      teamId: z.string().uuid(),
      userId: z.string(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        void,
        TeamMemberNotFoundError | LastOwnerError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await requireTeamOwner(db, data.teamId, user.id).andThen(() =>
          getMembership(db, data.teamId, data.userId).andThen((member) => {
            if (!member)
              return errAsync(
                new TeamMemberNotFoundError(data.teamId, data.userId),
              );
            return countOwners(db, data.teamId).andThen((ownerCount) => {
              if (member.role === "owner" && ownerCount <= 1)
                return errAsync(new LastOwnerError());
              return ResultAsync.fromPromise(
                db
                  .delete(teamMembers)
                  .where(
                    and(
                      eq(teamMembers.teamId, data.teamId),
                      eq(teamMembers.userId, data.userId),
                    ),
                  )
                  .then(() => undefined),
                (e) => new DbError("removeMember", e),
              );
            });
          }),
        ),
      );
    },
  );

// ─── leaveTeam ────────────────────────────────────────────────────────────────

export const leaveTeam = createServerFn({ method: "POST" })
  .validator(z.object({ teamId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        void,
        TeamMemberNotFoundError | LastOwnerError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      return toShape(
        await getMembership(db, data.teamId, user.id).andThen((member) => {
          if (!member)
            return errAsync(new TeamMemberNotFoundError(data.teamId, user.id));
          if (member.role !== "owner") {
            return ResultAsync.fromPromise(
              db
                .delete(teamMembers)
                .where(
                  and(
                    eq(teamMembers.teamId, data.teamId),
                    eq(teamMembers.userId, user.id),
                  ),
                )
                .then(() => undefined),
              (e) => new DbError("leaveTeam", e),
            );
          }
          return countOwners(db, data.teamId).andThen((ownerCount) => {
            if (ownerCount <= 1) return errAsync(new LastOwnerError());
            return ResultAsync.fromPromise(
              db
                .delete(teamMembers)
                .where(
                  and(
                    eq(teamMembers.teamId, data.teamId),
                    eq(teamMembers.userId, user.id),
                  ),
                )
                .then(() => undefined),
              (e) => new DbError("leaveTeam", e),
            );
          });
        }),
      );
    },
  );
