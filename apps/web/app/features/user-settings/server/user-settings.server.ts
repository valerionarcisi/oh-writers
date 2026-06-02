import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync, ok } from "neverthrow";
import { eq } from "drizzle-orm";
import { toShape } from "@oh-writers/utils";
import { ForbiddenError, DbError } from "@oh-writers/utils";
import { users, accounts, teams, teamMembers } from "@oh-writers/db/schema";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import type { TeamRole } from "@oh-writers/domain";

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().nullable(),
});

export const updateUserProfile = createServerFn({ method: "POST" })
  .validator(UpdateProfileSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return toShape(
      await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
        ResultAsync.fromPromise(
          db
            .update(users)
            .set({ name: data.name, avatarUrl: data.avatarUrl, updatedAt: new Date() })
            .where(eq(users.id, user.id))
            .returning({ name: users.name, avatarUrl: users.avatarUrl }),
          (e) => new DbError("updateUserProfile", e),
        ).andThen((rows) =>
          ok({ name: rows[0]!.name, avatarUrl: rows[0]!.avatarUrl ?? null }),
        ),
      ),
    );
  });

const UpdateLocaleSchema = z.object({
  locale: z.enum(["it", "en"]),
});

export const updateUserLocale = createServerFn({ method: "POST" })
  .validator(UpdateLocaleSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return toShape(
      await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
        ResultAsync.fromPromise(
          db
            .update(users)
            .set({ locale: data.locale, updatedAt: new Date() })
            .where(eq(users.id, user.id))
            .returning({ locale: users.locale }),
          (e) => new DbError("updateUserLocale", e),
        ).andThen((rows) => ok({ locale: rows[0]!.locale })),
      ),
    );
  });

export const getUserAccountProviders = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser();
    return toShape(
      await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
        ResultAsync.fromPromise(
          db
            .select({ providerId: accounts.providerId })
            .from(accounts)
            .where(eq(accounts.userId, user.id)),
          (e) => new DbError("getUserAccountProviders", e),
        ).andThen((rows) =>
          ok({ hasPassword: rows.some((r) => r.providerId === "credential") }),
        ),
      ),
    );
  },
);

export const getUserTeams = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return toShape(
    await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
      ResultAsync.fromPromise(
        db
          .select({
            id: teams.id,
            name: teams.name,
            avatarUrl: teams.avatarUrl,
            role: teamMembers.role,
          })
          .from(teamMembers)
          .innerJoin(teams, eq(teamMembers.teamId, teams.id))
          .where(eq(teamMembers.userId, user.id)),
        (e) => new DbError("getUserTeams", e),
      ).andThen((rows) =>
        ok(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            avatarUrl: r.avatarUrl ?? null,
            role: r.role as TeamRole,
          })),
        ),
      ),
    ),
  );
});

export const getUserProfile = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return toShape(
    await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
      ResultAsync.fromPromise(
        db
          .select({ name: users.name, email: users.email, avatarUrl: users.avatarUrl })
          .from(users)
          .where(eq(users.id, user.id))
          .then((rows) => rows[0] ?? null),
        (e) => new DbError("getUserProfile", e),
      ).andThen((row) =>
        row
          ? ok({ name: row.name, email: row.email, avatarUrl: row.avatarUrl ?? null })
          : ok({ name: user.name, email: user.email, avatarUrl: null }),
      ),
    ),
  );
});

// queryOptions for TanStack Query
import { queryOptions } from "@tanstack/react-query";

export const userProfileQueryOptions = () =>
  queryOptions({
    queryKey: ["user", "profile"],
    queryFn: () => getUserProfile(),
  });

export const userAccountProvidersQueryOptions = () =>
  queryOptions({
    queryKey: ["user", "account-providers"],
    queryFn: () => getUserAccountProviders(),
  });

export const userTeamsQueryOptions = () =>
  queryOptions({
    queryKey: ["user", "teams"],
    queryFn: () => getUserTeams(),
  });
