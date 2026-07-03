import { createServerFn } from "@tanstack/start";
import { getWebRequest } from "@tanstack/start/server";
import {
  DEV_AUTH_BYPASS_TOKEN,
  isDevAuthBypassEnabled,
} from "@oh-writers/domain";

export const devRealtimeToken = (
  env: NodeJS.ProcessEnv = process.env,
): { token: string } | null =>
  isDevAuthBypassEnabled(env) ? { token: DEV_AUTH_BYPASS_TOKEN } : null;

/**
 * Hand the caller their current Better Auth session token so the client can
 * open an authenticated WebSocket to the ws-server (which can't read the
 * httpOnly auth cookie cross-origin). Under DEV_AUTH_BYPASS it returns the
 * shared dev-only token accepted by the ws-server. Returns null when
 * unauthenticated.
 */
export const getRealtimeToken = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ token: string } | null> => {
    const request = getWebRequest();
    if (!request) return null;
    const bypassToken = devRealtimeToken();
    if (bypassToken) return bypassToken;
    const { auth } = await import("~/server/auth");
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.session?.token) return null;
    return { token: session.session.token };
  },
);
