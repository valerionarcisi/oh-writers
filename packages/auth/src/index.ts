import { betterAuth, APIError, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Redis } from "ioredis";
import { eq, and, isNull, ne, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@oh-writers/db";
import {
  users,
  sessions,
  accounts,
  verifications,
  teams,
  teamMembers,
  teamInvitations,
} from "@oh-writers/db/schema";
import { translate, type Locale } from "@oh-writers/domain";
import { sendResetPasswordEmail, sendVerificationEmail } from "./mailer";
export { sendTeamInviteEmail } from "./mailer";

const existsRow = async (
  table: PgTable,
  idColumn: PgColumn,
  condition: SQL,
): Promise<boolean> => {
  const [row] = await db
    .select({ id: idColumn })
    .from(table)
    .where(condition)
    .limit(1);
  return row !== undefined;
};

/**
 * Blocks account deletion when the user is the sole owner of a team that
 * still has other members or pending invitations — deleting would otherwise
 * hit the RESTRICT FK on teams.createdBy / teamInvitations.invitedBy as a raw
 * Postgres error. See GH #137: the product decision is to block with a clear
 * message rather than auto-reassign ownership or cascade-delete the team.
 *
 * This throws (rather than returning a neverthrow Result) because it plugs
 * into better-auth's own `deleteUser.beforeDelete` hook contract, which only
 * understands "throw to abort" — not an app-level server-fn boundary.
 */
const guardTeamOwnershipBeforeDelete = async (user: {
  id: string;
  locale?: Locale;
}): Promise<void> => {
  const ownedTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.createdBy, user.id));
  if (ownedTeams.length === 0) return;

  for (const team of ownedTeams) {
    const hasOtherMember = await existsRow(
      teamMembers,
      teamMembers.id,
      and(eq(teamMembers.teamId, team.id), ne(teamMembers.userId, user.id))!,
    );
    const hasPendingInvitation = await existsRow(
      teamInvitations,
      teamInvitations.id,
      and(
        eq(teamInvitations.teamId, team.id),
        isNull(teamInvitations.acceptedAt),
      )!,
    );

    if (hasOtherMember || hasPendingInvitation) {
      throw new APIError("BAD_REQUEST", {
        message: translate(
          user.locale ?? "en",
          "settings.delete.errorTeamOwner",
        ),
      });
    }
  }
};

const socialProviders: Record<
  string,
  { clientId: string; clientSecret: string }
> = {};

if (process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]) {
  socialProviders["google"] = {
    clientId: process.env["GOOGLE_CLIENT_ID"],
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"],
  };
}

if (process.env["GITHUB_CLIENT_ID"] && process.env["GITHUB_CLIENT_SECRET"]) {
  socialProviders["github"] = {
    clientId: process.env["GITHUB_CLIENT_ID"],
    clientSecret: process.env["GITHUB_CLIENT_SECRET"],
  };
}

// Collect all ports the dev server might bind to so Better Auth accepts
// local sign-in requests regardless of which port Vinxi picks.
const devOrigins = ["3000", "3001", "3002", "3003", "3004", "3005"].map(
  (p) => `http://localhost:${p}`,
);

// Production origin isn't a dev port — without it, Better Auth rejects every
// sign-in request from the real deployed domain as an untrusted origin.
const trustedOrigins = process.env["BETTER_AUTH_URL"]
  ? [...devOrigins, process.env["BETTER_AUTH_URL"]]
  : devOrigins;

/**
 * Redis-backed secondary session store, OPT-IN via `AUTH_USE_REDIS=true`.
 *
 * Better Auth treats `secondaryStorage`, when present, as the AUTHORITATIVE
 * session store — it writes AND reads sessions there, not in the Postgres
 * `session` table. So a half-working Redis (e.g. a write that silently fails)
 * leaves getSession reading null and bounces the user back to /login even
 * though sign-in returned 200. That fragility is not worth it for a single-
 * instance dev/prod run, where the Drizzle/Postgres primary store is robust.
 *
 * Therefore secondaryStorage is DISABLED by default (returns undefined → Better
 * Auth persists sessions in Postgres). Enable it explicitly with
 * `AUTH_USE_REDIS=true` only when the realtime ws-server runs multi-instance
 * and needs the shared fast lookup. Requires `REDIS_URL` to also be set.
 *
 * When enabled, Redis being DOWN must still never crash the host: ioredis
 * defaults to 20 retries then rejecting (MaxRetriesPerRequestError, which once
 * bubbled out of `set` during sign-in → 500). We cap retries and swallow
 * get/set/delete errors.
 */
const buildSecondaryStorage = (): BetterAuthOptions["secondaryStorage"] => {
  if (process.env["AUTH_USE_REDIS"] !== "true") return undefined;
  const url = process.env["REDIS_URL"];
  if (!url) return undefined;

  const redis = new Redis(url, {
    // Fail a command fast instead of retrying 20× and rejecting with
    // MaxRetriesPerRequestError. The caller degrades to the primary store.
    maxRetriesPerRequest: 1,
  });
  // Never let a transient Redis failure crash the host process.
  redis.on("error", () => undefined);

  return {
    get: async (key) => {
      try {
        return (await redis.get(key)) ?? null;
      } catch {
        return null;
      }
    },
    set: async (key, value, ttl) => {
      try {
        if (ttl) await redis.set(key, value, "EX", ttl);
        else await redis.set(key, value);
      } catch {
        // Best-effort cache write; the Postgres primary store is authoritative.
      }
    },
    delete: async (key) => {
      try {
        await redis.del(key);
      } catch {
        // Best-effort cache eviction; ignore if Redis is unreachable.
      }
    },
  };
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  secondaryStorage: buildSecondaryStorage(),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: sendResetPasswordEmail,
  },
  emailVerification: {
    sendVerificationEmail,
  },
  user: {
    deleteUser: {
      // Account deletion (Spec #127 item 2): enabled so the /api/auth/delete-user
      // route exists and the settings UI can offer "Elimina account". No
      // sendDeleteAccountVerification sender yet — deletion is immediate for
      // a fresh session (the SMTP delete-confirmation is a later refinement).
      enabled: true,
      beforeDelete: guardTeamOwnershipBeforeDelete,
    },
  },
  socialProviders,
  trustedOrigins,
  advanced: {
    database: {
      // better-auth generates ids for every model (users/accounts/…). The
      // "uuid" flag relies on Postgres generating ids, but only `users.id` has
      // a DB default — accounts/sessions/verifications are `text` PKs without
      // one → insert 422s. A generateId FUNCTION makes better-auth mint a UUID
      // itself for every model, valid in both the `uuid` users.id and the
      // `text` columns. (See 2026-08-17 signup 422.)
      generateId: () => crypto.randomUUID(),
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = (typeof auth.$Infer.Session)["user"];
