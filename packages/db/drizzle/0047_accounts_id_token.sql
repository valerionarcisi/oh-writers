-- Better Auth's core account model persists the OIDC id_token (Google
-- returns one alongside the access token, scope "openid") to a fixed field
-- named "idToken". Without it, OAuth sign-in fails at user/account creation
-- (BetterAuthError: unable_to_create_user), same class of gap as 0046.
ALTER TABLE "accounts" ADD COLUMN "id_token" text;
