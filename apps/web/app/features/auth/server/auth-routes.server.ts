import { createServerFn } from "@tanstack/start";

// The auth route loaders (login / register / invite) each need to know who the
// caller is before deciding whether to redirect. Defining their createServerFn
// inline in the route file put `@tanstack/start` — whose barrel re-exports the
// server half, and with it h3 — into those route chunks and, through shared
// chunks, into the client entry. h3 is unreachable from apps/web under pnpm's
// strict layout, so the browser got a bare `import "h3"` it could not resolve
// and every page hung on its skeleton (issue #98). Server functions belong in
// a .server.ts module; the route files now import these.

export const fetchLoginData = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getUser } = await import("~/server/context");
    const user = await getUser();
    return {
      isAuthenticated: !!user,
      availableProviders: [
        ...(process.env["GOOGLE_CLIENT_ID"] ? ["google"] : []),
        ...(process.env["GITHUB_CLIENT_ID"] ? ["github"] : []),
      ],
    };
  },
);

export const fetchIsAuthenticated = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getUser } = await import("~/server/context");
    const user = await getUser();
    return !!user;
  },
);

export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; name: string; email: string } | null> => {
    const { getUser } = await import("~/server/context");
    const user = await getUser();
    if (!user) return null;
    return { id: user.id as string, name: user.name, email: user.email };
  },
);
