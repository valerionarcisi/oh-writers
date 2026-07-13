import { createServerFn } from "@tanstack/start";
import type { Locale } from "@oh-writers/domain";

export type SerializableUser = {
  id: string;
  name: string;
  email: string;
  locale: Locale;
};

/**
 * Lives in its own file (not `_app.tsx`) for the bundle-boundary rule (see
 * `features/feature-flags/resolve-ai-enabled.server.ts`): a `createServerFn`
 * inside a route file makes vinxi extract a `?tsr-directive-use-server=`
 * module that still evaluates the file's top-level code — for `_app.tsx`
 * that meant importing the client-heavy `~/features/app-shell` barrel in the
 * server-fn graph, where the import cycle left `peekSearchSchema` undefined
 * and every RPC to `fetchUser` failed with a 503 (live regression,
 * 2026-07-13). Here the server-fn module imports server context only.
 */
export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SerializableUser | null> => {
    const { getUser } = await import("~/server/context");
    const user = await getUser();
    if (!user) return null;
    return {
      id: user.id as string,
      name: user.name,
      email: user.email,
      locale: user.locale,
    };
  },
);
