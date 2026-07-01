import { describe, it, expect, afterEach } from "vitest";
import { devAuthBypassUser } from "./context";

// The dev-auth bypass must be impossible to trigger in production and off unless
// explicitly opted in. These guard the two gates independently.
describe("devAuthBypassUser — gating", () => {
  const prevNode = process.env["NODE_ENV"];
  const prevFlag = process.env["DEV_AUTH_BYPASS"];

  afterEach(() => {
    process.env["NODE_ENV"] = prevNode;
    if (prevFlag === undefined) delete process.env["DEV_AUTH_BYPASS"];
    else process.env["DEV_AUTH_BYPASS"] = prevFlag;
  });

  it("returns the Test User when non-prod AND flag is exactly 'true'", () => {
    process.env["NODE_ENV"] = "development";
    process.env["DEV_AUTH_BYPASS"] = "true";
    const user = devAuthBypassUser();
    expect(user).not.toBeNull();
    expect(user?.email).toBe("test@ohwriters.dev");
    expect(user?.id).toBe("00000000-0000-4000-a000-000000000001");
  });

  it("is DISABLED in production even with the flag set", () => {
    process.env["NODE_ENV"] = "production";
    process.env["DEV_AUTH_BYPASS"] = "true";
    expect(devAuthBypassUser()).toBeNull();
  });

  it("is DISABLED when the flag is unset or not exactly 'true'", () => {
    process.env["NODE_ENV"] = "development";
    delete process.env["DEV_AUTH_BYPASS"];
    expect(devAuthBypassUser()).toBeNull();
    process.env["DEV_AUTH_BYPASS"] = "1";
    expect(devAuthBypassUser()).toBeNull();
    process.env["DEV_AUTH_BYPASS"] = "false";
    expect(devAuthBypassUser()).toBeNull();
  });
});
