-- Better Auth's core user model writes the OAuth provider's avatar to a
-- fixed field named "image" (not configurable) — separate from avatar_url,
-- which the rest of the app reads/writes for the user's own uploaded avatar.
-- Without this column, the first successful Google/GitHub sign-in fails at
-- user creation (BetterAuthError: unable_to_create_user).
ALTER TABLE "users" ADD COLUMN "image" text;
