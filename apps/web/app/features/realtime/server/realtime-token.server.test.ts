import { describe, expect, it } from "vitest";
import { DEV_AUTH_BYPASS_TOKEN } from "@oh-writers/domain";
import { devRealtimeToken } from "./realtime-token.server";

describe("devRealtimeToken", () => {
  it("returns the shared dev token when DEV_AUTH_BYPASS is enabled outside production", () => {
    expect(
      devRealtimeToken({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "true",
      } as NodeJS.ProcessEnv),
    ).toEqual({ token: DEV_AUTH_BYPASS_TOKEN });
  });

  it("is disabled in production even with the flag set", () => {
    expect(
      devRealtimeToken({
        NODE_ENV: "production",
        DEV_AUTH_BYPASS: "true",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("is disabled when the flag is unset or not exactly true", () => {
    expect(
      devRealtimeToken({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      devRealtimeToken({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "1",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });
});
