import { describe, expect, it } from "vitest";
import {
  DEV_AUTH_BYPASS_TOKEN,
  DEV_AUTH_BYPASS_USER_ID,
  isDevAuthBypassEnabled,
} from "./dev-auth";

describe("dev auth bypass constants", () => {
  it("uses the seeded Test User id", () => {
    expect(DEV_AUTH_BYPASS_USER_ID).toBe(
      "00000000-0000-4000-a000-000000000001",
    );
  });

  it("uses a stable token for dev-only realtime sockets", () => {
    expect(DEV_AUTH_BYPASS_TOKEN).toBe("dev-auth-bypass:test-user");
  });
});

describe("isDevAuthBypassEnabled", () => {
  it("is enabled only when the flag is exactly true outside production", () => {
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "true",
      }),
    ).toBe(true);
  });

  it("is disabled in production even when the flag is true", () => {
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "production",
        DEV_AUTH_BYPASS: "true",
      }),
    ).toBe(false);
  });

  it("is disabled when the flag is unset or not exactly true", () => {
    expect(isDevAuthBypassEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "1",
      }),
    ).toBe(false);
    expect(
      isDevAuthBypassEnabled({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "false",
      }),
    ).toBe(false);
  });
});
