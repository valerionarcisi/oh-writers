import { getWebRequest } from "@tanstack/start/server";
import type { Locale, UserId } from "@oh-writers/domain";

export type AppUser = {
  id: UserId;
  name: string;
  email: string;
  locale: Locale;
};

// Resolve the user from an EXPLICIT Headers object. API file routes (e.g.
// `/api/cesare/stream`) receive `request` as a handler argument and must pass
// `request.headers` here directly — the ambient `getWebRequest()` is not
// reliably populated inside an API route's POST handler the way it is inside a
// `createServerFn`, which silently yielded "no session → 403" on the stream.
export const getUserFromHeaders = async (
  headers: Headers,
): Promise<AppUser | null> => {
  // Dynamic import: auth.ts pulls in @oh-writers/db → postgres which
  // references Node-only globals (Buffer, net). Keeping this dynamic
  // ensures the browser bundle never loads the postgres driver.
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;

  // The Better Auth session user does not carry `locale`; read it from the
  // users row. Default to 'en' if the row is somehow missing the column.
  const { db } = await import("@oh-writers/db");
  const { users } = await import("@oh-writers/db/schema");
  const { eq } = await import("drizzle-orm");
  const row = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { locale: true },
  });

  return {
    id: session.user.id as UserId,
    name: session.user.name,
    email: session.user.email,
    locale: (row?.locale ?? "en") as Locale,
  };
};

export const getUser = async (): Promise<AppUser | null> => {
  const request = getWebRequest();
  if (!request) return null;
  return getUserFromHeaders(request.headers);
};

export const requireUser = async (): Promise<AppUser> => {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
};
