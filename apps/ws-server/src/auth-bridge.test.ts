import { describe, expect, it } from "vitest";
import {
  DEV_AUTH_BYPASS_TOKEN,
  DEV_AUTH_BYPASS_USER_ID,
} from "@oh-writers/domain";
import { validateDevAuthBypassToken } from "./auth-bridge";

describe("validateDevAuthBypassToken", () => {
  it("accepts the shared bypass token only when the dev bypass is enabled", () => {
    expect(
      validateDevAuthBypassToken(DEV_AUTH_BYPASS_TOKEN, {
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "true",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      userId: DEV_AUTH_BYPASS_USER_ID,
      sessionId: DEV_AUTH_BYPASS_TOKEN,
    });
  });

  it("rejects the token in production even when the flag is true", () => {
    expect(
      validateDevAuthBypassToken(DEV_AUTH_BYPASS_TOKEN, {
        NODE_ENV: "production",
        DEV_AUTH_BYPASS: "true",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("rejects unknown tokens and disabled bypass configs", () => {
    expect(
      validateDevAuthBypassToken("not-the-dev-token", {
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "true",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      validateDevAuthBypassToken(DEV_AUTH_BYPASS_TOKEN, {
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });
});
