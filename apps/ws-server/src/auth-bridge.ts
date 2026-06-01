import type { IncomingMessage } from "node:http";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@oh-writers/db";
import { sessions } from "@oh-writers/db/schema";

export interface ValidatedSession {
  userId: string;
  sessionId: string;
}

const tokenFromRequest = (req: IncomingMessage): string | null => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");
  return token && token.length > 0 ? token : null;
};

/**
 * Validate the WebSocket upgrade against the Better Auth session store. The
 * client passes its session token (the `sessions.token` value) as the `?token=`
 * query param — cross-origin WebSocket connections can't carry the httpOnly
 * auth cookie, so the token is the handoff. We look it up directly (Redis caches
 * the same rows behind Better Auth's secondaryStorage) and check expiry.
 * Returns null on any failure so the caller closes with 4001.
 */
export const validateSession = async (
  req: IncomingMessage,
): Promise<ValidatedSession | null> => {
  const token = tokenFromRequest(req);
  if (!token) return null;

  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())),
    columns: { id: true, userId: true },
  });
  if (!row) return null;

  return { userId: row.userId, sessionId: row.id };
};
