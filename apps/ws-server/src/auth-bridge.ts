import type { IncomingMessage } from "node:http";
import { auth } from "@oh-writers/auth";

export interface ValidatedSession {
  userId: string;
  sessionId: string;
}

const buildHeaders = (req: IncomingMessage): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else headers.set(key, value);
  }

  // Support the `?token=<session>` form (spec): clients that cannot set a
  // cookie (e.g. a future mobile bearer client) pass the session token in the
  // query string; we forward it as a Bearer Authorization header.
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return headers;
};

/**
 * Validate the WebSocket upgrade request against Better Auth (Redis-backed
 * session lookup). Returns null when there is no valid session, so the caller
 * can close the socket with 4001.
 */
export const validateSession = async (
  req: IncomingMessage,
): Promise<ValidatedSession | null> => {
  const session = await auth.api.getSession({ headers: buildHeaders(req) });
  if (!session?.user || !session.session) return null;
  return {
    userId: session.user.id,
    sessionId: session.session.id,
  };
};
