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
export const resolveLocale = async (): Promise<Locale> => {
  const { getWebRequest } = await import("@tanstack/start/server");
  const request = getWebRequest();

  const { getUser } = await import("~/server/context");
  const user = await getUser();
  if (user) return user.locale;

  return fromAcceptLanguage(request?.headers.get("accept-language") ?? null) ?? Locales.EN;
};
