import { getWebRequest } from "@tanstack/start/server";
import { ResultAsync } from "neverthrow";
import {
  DEV_AUTH_BYPASS_USER_ID,
  isDevAuthBypassEnabled,
  type Locale,
  type UserId,
} from "@oh-writers/domain";
import { parseAvatarUrl } from "./helpers";

export type AppUser = {
  id: UserId;
  name: string;
  email: string;
  locale: Locale;
  /** Profile photo — the OAuth provider's avatar (Better Auth's `image`
   *  field) when the user signed up via Google/GitHub. Null for
   *  email/password accounts (no upload flow yet — TopBarAccount falls back
   *  to initials). */
  avatarUrl: string | null;
};

// ─── Dev-only auth bypass ──────────────────────────────────────────────────────
//
// When `DEV_AUTH_BYPASS=true` AND we are NOT in production, every request
// resolves to the seeded Test User instead of a real Better Auth session. This
// lets Playwright / Chrome drive the app without logging in, scoped to the seed
// project "Non fa ridere" (010) that Test User personally owns — so automated
// runs never touch real data.
//
// Safety: BOTH gates are required and both are read server-side only (this file
// is dynamically imported to stay out of the browser bundle). The flag is
// deliberately NOT exposed via app.config.ts, so it can never reach the client.
// In production `NODE_ENV === "production"` disables it regardless of the flag.
const DEV_BYPASS_USER: AppUser = {
  id: DEV_AUTH_BYPASS_USER_ID as UserId,
  name: "Test User",
  email: "test@ohwriters.dev",
  locale: "it" as Locale,
  avatarUrl: null,
};

let devBypassLogged = false;

// Exported for unit tests. Pure: reads only process.env.
export const devAuthBypassUser = (): AppUser | null => {
  if (!isDevAuthBypassEnabled(process.env)) return null;
  if (!devBypassLogged) {
    // One-time loud signal so an active bypass is never a silent surprise.
    // eslint-disable-next-line no-console
    console.warn(
      `[DEV] auth bypass ACTIVE — every request runs as ${DEV_BYPASS_USER.email}. Never enable in production.`,
    );
    devBypassLogged = true;
  }
  return DEV_BYPASS_USER;
};

// Resolve the user from an EXPLICIT Headers object. API file routes (e.g.
// `/api/cesare/stream`) receive `request` as a handler argument and must pass
// `request.headers` here directly — the ambient `getWebRequest()` is not
// reliably populated inside an API route's POST handler the way it is inside a
// `createServerFn`, which silently yielded "no session → 403" on the stream.
export const getUserFromHeaders = async (
  headers: Headers,
): Promise<AppUser | null> => {
  // Dev-only bypass short-circuit (see DEV_BYPASS_USER above). Covers every
  // consumer — getUser, requireUser, requireProjectAccess(WithHeaders), the
  // _app loader, and API routes — because they all resolve the user here.
  const bypass = devAuthBypassUser();
  if (bypass) return bypass;

  // Dynamic import: auth.ts pulls in @oh-writers/db → postgres which
  // references Node-only globals (Buffer, net). Keeping this dynamic
  // ensures the browser bundle never loads the postgres driver.
  const { auth } = await import("./auth");

  // A stale or unverifiable session cookie (DB reset, rotated
  // BETTER_AUTH_SECRET, expired/forged token) makes Better Auth throw
  // `APIError: Failed to get session`. That is an EXPECTED unauthenticated
  // state, not a server fault — treat it as "no user" so the route loader
  // redirects to /login instead of blanking the whole app in the error
  // boundary. A genuine DB outage surfaces later on the locale query below.
  const sessionResult = await ResultAsync.fromPromise(
    auth.api.getSession({ headers }),
    (error) => error,
  );
  if (sessionResult.isErr()) return null;
  const session = sessionResult.value;
  if (!session?.user) return null;

  // The Better Auth session user does not carry `locale`; read it from the
  // users row. A plain select (not the relational `db.query`) avoids Drizzle's
  // "No fields selected"/buildRelationalQueryWithoutPK quirk when picking a
  // single non-PK column. Default to 'en' if somehow absent.
  const { db } = await import("@oh-writers/db");
  const { users } = await import("@oh-writers/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return {
    id: session.user.id as UserId,
    name: session.user.name,
    email: session.user.email,
    locale: (rows[0]?.locale ?? "en") as Locale,
    avatarUrl: parseAvatarUrl(session.user.image),
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
