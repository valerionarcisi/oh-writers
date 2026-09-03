import { z } from "zod";

// Strip binary fields (yjsState, yjsSnapshot) before sending to client.
// These are bytea columns that don't survive JSON serialization meaningfully.
export const stripYjsState = <T extends { yjsState?: unknown }>({
  yjsState: _,
  ...rest
}: T): Omit<T, "yjsState"> => rest as Omit<T, "yjsState">;

export const stripYjsSnapshot = <T extends { yjsSnapshot?: unknown }>({
  yjsSnapshot: _,
  ...rest
}: T): Omit<T, "yjsSnapshot"> => rest as Omit<T, "yjsSnapshot">;

// Better Auth stores whatever the OAuth provider hands back in `image` — no
// shape guarantee. A malformed value (empty string, non-http scheme) reaching
// <img src> renders the browser's broken-image icon, since the client-side
// onError fallback only catches a failed NETWORK load, not an invalid src to
// begin with. Used for both the TopBar avatar (server/context.ts) and the
// user-settings profile form's OAuth fallback (features/user-settings).
const AvatarUrlSchema = z.string().url().startsWith("http");
export const parseAvatarUrl = (
  raw: string | null | undefined,
): string | null => {
  const result = AvatarUrlSchema.safeParse(raw);
  return result.success ? result.data : null;
};
