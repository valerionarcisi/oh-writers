import { createServerFn } from "@tanstack/start";
import { Locales, type Locale } from "@oh-writers/domain";

const SUPPORTED: ReadonlyArray<Locale> = [Locales.IT, Locales.EN];

/** Pick the first supported locale named in an Accept-Language header. */
const fromAcceptLanguage = (header: string | null): Locale | null => {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0];
    const match = SUPPORTED.find((l) => l === base);
    if (match) return match;
  }
  return null;
};

/**
 * Resolve the UI locale SERVER-SIDE, in priority order:
 *   1. the signed-in user's `users.locale`
 *   2. the request's Accept-Language header
 *   3. 'en'
 * Always returns a concrete Locale (never undefined) so SSR `<html lang>` and
 * the client provider agree.
 */
const resolveLocaleImpl = async (): Promise<Locale> => {
  const { getWebRequest } = await import("@tanstack/start/server");
  const request = getWebRequest();

  const { getUser } = await import("~/server/context");
  const user = await getUser();
  if (user) return user.locale;

  return fromAcceptLanguage(request?.headers.get("accept-language") ?? null) ?? Locales.EN;
};

/**
 * Server function that resolves the UI locale. It MUST be a `createServerFn` and
 * never called inline from a loader: TanStack Start re-runs loaders on the
 * client during in-app navigation, where `getWebRequest()` has no server context
 * and throws (`undefined.config`). As a server fn the client invokes it via RPC,
 * so `getWebRequest()` always runs on the server. See audit ALTO-1 (2026-06-02).
 */
export const resolveLocale = createServerFn({ method: "GET" }).handler(
  resolveLocaleImpl,
);
