import { describe, it, expect } from "vitest";
import type { Peer } from "~/features/realtime";
import { onlineCollaboratorIds } from "./TeamPresence";

const peer = (overrides: Partial<Peer>): Peer => ({
  clientId: 1,
  userId: null,
  name: "Peer",
  color: "#000",
  ...overrides,
});

describe("onlineCollaboratorIds", () => {
  it("maps peer userIds to the online set", () => {
    const ids = onlineCollaboratorIds(
      [
        peer({ clientId: 1, userId: "u-1" }),
        peer({ clientId: 2, userId: "u-2" }),
      ],
      null,
      false,
    );
    expect([...ids].sort()).toEqual(["u-1", "u-2"]);
  });

  it("ignores peers without a userId (legacy awareness state)", () => {
    const ids = onlineCollaboratorIds(
      [peer({ clientId: 1, userId: null })],
      null,
      false,
    );
    expect(ids.size).toBe(0);
  });

  it("includes the local user when the room is connected", () => {
    const ids = onlineCollaboratorIds([], "me", true);
    expect(ids.has("me")).toBe(true);
  });

  it("excludes the local user when the room is not connected", () => {
    const ids = onlineCollaboratorIds([], "me", false);
    expect(ids.has("me")).toBe(false);
  });

  it("dedupes the local user against a peer reporting the same id", () => {
    const ids = onlineCollaboratorIds(
      [peer({ clientId: 7, userId: "me" })],
      "me",
      true,
    );
    expect([...ids]).toEqual(["me"]);
  });
});
