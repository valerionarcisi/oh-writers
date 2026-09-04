import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Locale } from "@oh-writers/domain";

// DB strategy: mock @oh-writers/db (same approach as
// apps/ws-server/src/persistence.test.ts) — CI's unit lane has no Postgres, and
// client.ts throws at import time without DATABASE_URL. Real coverage of the
// query shape lives in the E2E suite; this test isolates the branching logic
// in guardTeamOwnershipBeforeDelete (GH #137).

const fixture = vi.hoisted(() => {
  const state = {
    ownedTeamIds: [] as string[],
    otherMembers: new Set<string>(), // team ids with another member
    pendingInvites: new Set<string>(), // team ids with a pending invitation
  };

  // Mimics db.select({...}).from(table).where(cond).limit(n) — resolves to
  // rows based on which table/condition-shape was queried, driven by `state`.
  const makeQuery = (rows: () => Array<{ id: string }>) => ({
    from: () => ({
      where: () => ({
        limit: async () => rows(),
        then: (resolve: (v: Array<{ id: string }>) => unknown) =>
          resolve(rows()),
      }),
    }),
  });

  return { state, makeQuery };
});

vi.mock("@oh-writers/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@oh-writers/db/schema", () => ({
  users: {},
  sessions: {},
  accounts: {},
  verifications: {},
  teams: { id: "teams.id", createdBy: "teams.created_by" },
  teamMembers: { id: "team_members.id", teamId: "x", userId: "x" },
  teamInvitations: { id: "team_invitations.id", teamId: "x", acceptedAt: "x" },
}));

vi.mock("better-auth", async () => {
  const actual = await vi.importActual<object>("better-auth");
  return actual;
});

const setup = async () => {
  vi.resetModules();
  const { db } = await import("@oh-writers/db");
  const selectMock = vi.mocked(db.select);

  // Call order inside guardTeamOwnershipBeforeDelete: owned teams, then per
  // team [otherMember, pendingInvitation].
  let call = 0;
  selectMock.mockImplementation(() => {
    const thisCall = call++;
    return fixture.makeQuery(() => {
      if (thisCall === 0) {
        return fixture.state.ownedTeamIds.map((id) => ({ id }));
      }
      // Alternates otherMember / pendingInvitation per owned team, in order.
      const teamIndex = Math.floor((thisCall - 1) / 2);
      const isOtherMemberQuery = (thisCall - 1) % 2 === 0;
      const teamId = fixture.state.ownedTeamIds[teamIndex];
      if (!teamId) return [];
      const hit = isOtherMemberQuery
        ? fixture.state.otherMembers.has(teamId)
        : fixture.state.pendingInvites.has(teamId);
      return hit ? [{ id: "row" }] : [];
    }) as unknown as ReturnType<typeof db.select>;
  });

  const mod = await import("./index");
  return mod;
};

describe("guardTeamOwnershipBeforeDelete (via deleteUser.beforeDelete)", () => {
  beforeEach(() => {
    fixture.state.ownedTeamIds = [];
    fixture.state.otherMembers = new Set();
    fixture.state.pendingInvites = new Set();
  });

  const runGuard = async (user: { id: string; locale?: Locale }) => {
    const { auth } = await setup();
    const beforeDelete = auth.options.user?.deleteUser?.beforeDelete;
    if (!beforeDelete) throw new Error("beforeDelete not configured");
    // @ts-expect-error - test double, only .id/.locale are read
    return beforeDelete(user, undefined);
  };

  it("allows deletion when the user owns no team", async () => {
    await expect(runGuard({ id: "u1", locale: "en" })).resolves.toBeUndefined();
  });

  it("allows deletion when the owned team has no other members and no pending invites", async () => {
    fixture.state.ownedTeamIds = ["t1"];
    await expect(runGuard({ id: "u1", locale: "en" })).resolves.toBeUndefined();
  });

  it("blocks deletion (English) when the owned team has another member", async () => {
    fixture.state.ownedTeamIds = ["t1"];
    fixture.state.otherMembers.add("t1");
    await expect(runGuard({ id: "u1", locale: "en" })).rejects.toMatchObject({
      body: { message: expect.stringMatching(/sole owner/i) },
    });
  });

  it("blocks deletion (Italian) when the owned team has a pending invitation", async () => {
    fixture.state.ownedTeamIds = ["t1"];
    fixture.state.pendingInvites.add("t1");
    await expect(runGuard({ id: "u1", locale: "it" })).rejects.toMatchObject({
      body: { message: expect.stringMatching(/unico proprietario/i) },
    });
  });

  it("defaults to English when locale is missing", async () => {
    fixture.state.ownedTeamIds = ["t1"];
    fixture.state.otherMembers.add("t1");
    await expect(runGuard({ id: "u1" })).rejects.toMatchObject({
      body: { message: expect.stringMatching(/sole owner/i) },
    });
  });
});

describe("trustedOrigins", () => {
  const ORIGINAL_BETTER_AUTH_URL = process.env["BETTER_AUTH_URL"];

  afterEach(() => {
    if (ORIGINAL_BETTER_AUTH_URL === undefined) {
      delete process.env["BETTER_AUTH_URL"];
    } else {
      process.env["BETTER_AUTH_URL"] = ORIGINAL_BETTER_AUTH_URL;
    }
  });

  it("includes only localhost dev ports when BETTER_AUTH_URL is unset", async () => {
    delete process.env["BETTER_AUTH_URL"];
    const { auth } = await setup();
    expect(auth.options.trustedOrigins).toEqual(
      expect.arrayContaining(["http://localhost:3000"]),
    );
    expect(auth.options.trustedOrigins).not.toContain(
      "https://app.ohwriters.com",
    );
  });

  it("appends BETTER_AUTH_URL when set, without dropping dev origins", async () => {
    process.env["BETTER_AUTH_URL"] = "https://app.ohwriters.com";
    const { auth } = await setup();
    expect(auth.options.trustedOrigins).toEqual(
      expect.arrayContaining([
        "http://localhost:3000",
        "https://app.ohwriters.com",
      ]),
    );
  });
});
