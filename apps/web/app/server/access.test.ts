import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { ForbiddenError, DbError } from "@oh-writers/utils";

vi.mock("~/server/context", () => ({
  requireUser: vi.fn(),
  getUserFromHeaders: vi.fn(),
}));
vi.mock("~/server/permissions", () => ({
  getMembership: vi.fn(),
  canEdit: vi.fn(),
  isOwner: vi.fn(),
}));
vi.mock("~/features/ai", () => ({
  openAiIdentityScope: vi.fn(),
  setAiRequestIdentity: vi.fn(),
}));
vi.mock("~/features/projects", () => ({
  ProjectNotFoundError: class {
    readonly _tag = "ProjectNotFoundError" as const;
    readonly message: string;
    constructor(readonly id: string) {
      this.message = `Project not found: ${id}`;
    }
  },
}));

import { requireProjectAccess } from "./access";
import { requireUser } from "~/server/context";
import { getMembership, canEdit } from "~/server/permissions";

const DB = {
  query: { projects: { findFirst: vi.fn() } },
} as unknown as {
  query: { projects: { findFirst: ReturnType<typeof vi.fn> } };
};
const USER = { id: "u1", name: "U", email: "u@x", image: null, role: "user" };
const PROJECT_ID = "00000000-0000-4000-a000-000000000010";

const projectRow = (overrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  title: "x",
  slug: "x",
  ownerId: USER.id,
  teamId: null,
  isArchived: false,
  ...overrides,
});

describe("requireProjectAccess — archived-project edit gate (Spec 85 #1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      requireUser as unknown as ReturnType<typeof vi.fn>,
    ).mockResolvedValue(USER);
    vi.mocked(
      getMembership as unknown as ReturnType<typeof vi.fn>,
    ).mockReturnValue(ok(null));
    vi.mocked(canEdit as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      true,
    );
  });

  it("allows an editor on a non-archived project", async () => {
    vi.mocked(DB.query.projects.findFirst).mockResolvedValue(
      projectRow({ isArchived: false }),
    );
    const result = await requireProjectAccess(DB as never, PROJECT_ID, "edit");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.project.id).toBe(PROJECT_ID);
  });

  it("denies edit on an archived project even for the personal owner", async () => {
    vi.mocked(DB.query.projects.findFirst).mockResolvedValue(
      projectRow({ isArchived: true }),
    );
    const result = await requireProjectAccess(DB as never, PROJECT_ID, "edit");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBeInstanceOf(ForbiddenError);
  });

  it("still allows view on an archived project (view is not gated by archive)", async () => {
    vi.mocked(DB.query.projects.findFirst).mockResolvedValue(
      projectRow({ isArchived: true }),
    );
    const result = await requireProjectAccess(DB as never, PROJECT_ID, "view");
    expect(result.isOk()).toBe(true);
  });

  it("returns ProjectNotFoundError result for a missing project (not a throw)", async () => {
    vi.mocked(DB.query.projects.findFirst).mockResolvedValue(null);
    const result = await requireProjectAccess(DB as never, PROJECT_ID, "view");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error._tag).toBe("ProjectNotFoundError");
  });
});
