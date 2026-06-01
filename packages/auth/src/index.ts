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
 * Redis-backed fast session lookup. The Drizzle/Postgres adapter stays the
 * primary store; secondaryStorage is the cache the realtime ws-server reads
 * on every WebSocket upgrade. When REDIS_URL is unset (e.g. a plain dev run
 * without Redis) we omit it entirely so the process never fails at import and
 * Better Auth falls back to the primary store.
 */
const buildSecondaryStorage = (): BetterAuthOptions["secondaryStorage"] => {
  const url = process.env["REDIS_URL"];
  if (!url) return undefined;

  const redis = new Redis(url, { lazyConnect: true });
  // Never let a transient Redis failure crash the host process.
  redis.on("error", () => undefined);

  return {
    get: async (key) => (await redis.get(key)) ?? null,
    set: async (key, value, ttl) => {
      if (ttl) await redis.set(key, value, "EX", ttl);
      else await redis.set(key, value);
    },
    delete: async (key) => {
      await redis.del(key);
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
    requireEmailVerification: false,
  },
  socialProviders,
  trustedOrigins: devOrigins,
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = (typeof auth.$Infer.Session)["user"];
