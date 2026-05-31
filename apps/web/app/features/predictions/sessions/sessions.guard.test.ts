// [OHW-047-A5] Ownership/same-project guard for the central session route.
//
// `ownsSession` is the pure predicate behind `getSession`: a session is
// reachable from `/projects/:id/sessions/:sessionId` ONLY when it belongs to
// the requesting user AND to the project named in the URL. Every other case
// must fail closed so the route renders not-found without leaking ownership.
import { describe, it, expect } from "vitest";
import { ownsSession } from "./sessions.server";
import { GetSessionInput } from "./sessions.schema";

const USER_A = "00000000-0000-4000-a000-0000000000a1";
const USER_B = "00000000-0000-4000-a000-0000000000b2";
const PROJECT_X = "00000000-0000-4000-a000-0000000000c3";
const PROJECT_Y = "00000000-0000-4000-a000-0000000000d4";

describe("ownsSession — fail-closed guard", () => {
  it("allows the owner viewing it under the matching project", () => {
    expect(
      ownsSession(
        { userId: USER_A, projectId: PROJECT_X },
        { userId: USER_A, projectId: PROJECT_X },
      ),
    ).toBe(true);
  });

  it("rejects a session owned by a different user (no cross-user leak)", () => {
    expect(
      ownsSession(
        { userId: USER_B, projectId: PROJECT_X },
        { userId: USER_A, projectId: PROJECT_X },
      ),
    ).toBe(false);
  });

  it("rejects a session that belongs to a different project (no cross-project leak)", () => {
    expect(
      ownsSession(
        { userId: USER_A, projectId: PROJECT_Y },
        { userId: USER_A, projectId: PROJECT_X },
      ),
    ).toBe(false);
  });

  it("rejects when both user and project mismatch", () => {
    expect(
      ownsSession(
        { userId: USER_B, projectId: PROJECT_Y },
        { userId: USER_A, projectId: PROJECT_X },
      ),
    ).toBe(false);
  });
});

describe("GetSessionInput — param validation", () => {
  it("accepts a uuid id + uuid projectId", () => {
    const r = GetSessionInput.safeParse({
      id: PROJECT_X,
      projectId: PROJECT_Y,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-uuid session id", () => {
    const r = GetSessionInput.safeParse({
      id: "not-a-uuid",
      projectId: PROJECT_Y,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing projectId", () => {
    const r = GetSessionInput.safeParse({ id: PROJECT_X });
    expect(r.success).toBe(false);
  });
});
