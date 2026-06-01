import { createServerFn } from "@tanstack/start";
import { getWebRequest } from "@tanstack/start/server";

/**
 * Hand the caller their current Better Auth session token so the client can
 * open an authenticated WebSocket to the ws-server (which can't read the
 * httpOnly auth cookie cross-origin). Returns null when unauthenticated.
 */
export const getRealtimeToken = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ token: string } | null> => {
    const request = getWebRequest();
    if (!request) return null;
    const { auth } = await import("~/server/auth");
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.session?.token) return null;
    return { token: session.session.token };
  },
);
