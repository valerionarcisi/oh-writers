import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Redis } from "ioredis";
import { db } from "@oh-writers/db";
import {
  users,
  sessions,
  accounts,
  verifications,
} from "@oh-writers/db/schema";
import { sendResetPasswordEmail, sendVerificationEmail } from "./mailer";
export { sendTeamInviteEmail } from "./mailer";

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
    },
  },
  socialProviders,
  trustedOrigins: devOrigins,
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
