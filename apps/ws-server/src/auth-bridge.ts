import type { IncomingMessage } from "node:http";
import { Redis } from "ioredis";
import { and, eq, gt } from "drizzle-orm";
import {
  DEV_AUTH_BYPASS_TOKEN,
  DEV_AUTH_BYPASS_USER_ID,
  isDevAuthBypassEnabled,
} from "@oh-writers/domain";

export interface ValidatedSession {
  userId: string;
  sessionId: string;
}

const tokenFromRequest = (req: IncomingMessage): string | null => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");
  return token && token.length > 0 ? token : null;
};

// Deliberate deviation from Spec 09b D5 ("validate via the shared
// auth.api.getSession"): `getSession` is built for an HTTP request carrying the
// signed session cookie, which a cross-origin WebSocket upgrade cannot provide.
// The client therefore hands us the raw session token (`?token=`), and we
// validate it directly against the same stores Better Auth writes to —
// Redis first (where active sessions live once secondaryStorage is enabled,
// keyed by token), then the DB `sessions` table as a fallback. This keeps the
// ws-server decoupled from Better Auth's request/cookie plumbing; the only
// coupling is the secondaryStorage value shape, asserted by the integration
// test (ws-integration.test.ts).
const redisUrl = process.env["REDIS_URL"];
const redis = redisUrl ? new Redis(redisUrl, { lazyConnect: true }) : null;
redis?.on("error", () => undefined);

interface StoredSession {
  session?: { id?: string; userId?: string; expiresAt?: string };
  user?: { id?: string };
}

const fromRedis = async (token: string): Promise<ValidatedSession | null> => {
  if (!redis) return null;
  const raw = await redis.get(token);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredSession;
  const userId = parsed.user?.id ?? parsed.session?.userId;
  if (!userId) return null;
  if (parsed.session?.expiresAt) {
    if (new Date(parsed.session.expiresAt).getTime() <= Date.now()) return null;
  }
  return { userId, sessionId: parsed.session?.id ?? token };
};

export const validateDevAuthBypassToken = (
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): ValidatedSession | null => {
  if (!isDevAuthBypassEnabled(env)) return null;
  if (token !== DEV_AUTH_BYPASS_TOKEN) return null;
  return {
    userId: DEV_AUTH_BYPASS_USER_ID,
    sessionId: DEV_AUTH_BYPASS_TOKEN,
  };
};

const fromDb = async (token: string): Promise<ValidatedSession | null> => {
  const [{ db }, { sessions }] = await Promise.all([
    import("@oh-writers/db"),
    import("@oh-writers/db/schema"),
  ]);
  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())),
    columns: { id: true, userId: true },
  });
  return row ? { userId: row.userId, sessionId: row.id } : null;
};

/**
 * Validate the WebSocket upgrade. The client passes its Better Auth session
 * token (`?token=`) — cross-origin WS can't carry the httpOnly cookie. We check
 * Redis first (where active sessions live when secondaryStorage is enabled),
 * then fall back to the DB sessions table. Returns null on failure → 4001.
 */
export const validateSession = async (
  req: IncomingMessage,
): Promise<ValidatedSession | null> => {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const devSession = validateDevAuthBypassToken(token);
  if (devSession) return devSession;
  return (await fromRedis(token)) ?? (await fromDb(token));
};
