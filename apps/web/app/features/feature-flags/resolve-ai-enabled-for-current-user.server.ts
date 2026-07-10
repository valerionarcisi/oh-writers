import { createServerFn } from "@tanstack/start";
import { resolveAiEnabled } from "./resolve-ai-enabled.server";

/**
 * Resolves `Features.AI_ENABLED` for the signed-in user making the current
 * request. Thin `createServerFn` wrapper around `resolveAiEnabled` — mirrors
 * `resolveLocale` (`~/features/i18n/resolve-locale.server`): it MUST be a
 * server fn and never called inline from a loader, because TanStack re-runs
 * loaders client-side on in-app navigation, where `getWebRequest()` has no
 * server context. As a server fn the client invokes it via RPC, so the
 * request/session lookup always runs on the server. See audit ALTO-1.
 *
 * An unauthenticated request (no session — route guards handle the redirect
 * elsewhere) resolves to `false`: no user means no provider/trial state, so
 * AI has nothing to be enabled for.
 */
const resolveAiEnabledForCurrentUserImpl = async (): Promise<boolean> => {
  const { getUser } = await import("~/server/context");
  const user = await getUser();
  if (!user) return false;

  const { db } = await import("@oh-writers/db");
  return resolveAiEnabled(user.id, db);
};

export const resolveAiEnabledForCurrentUser = createServerFn({
  method: "GET",
}).handler(resolveAiEnabledForCurrentUserImpl);
