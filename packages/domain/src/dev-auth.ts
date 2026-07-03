export const DEV_AUTH_BYPASS_USER_ID = "00000000-0000-4000-a000-000000000001";

export const DEV_AUTH_BYPASS_TOKEN = "dev-auth-bypass:test-user";

type DevAuthBypassEnv = Readonly<Record<string, string | undefined>>;

export const isDevAuthBypassEnabled = (env: DevAuthBypassEnv): boolean =>
  env["NODE_ENV"] !== "production" && env["DEV_AUTH_BYPASS"] === "true";
