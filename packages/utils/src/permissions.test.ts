import { describe, expect, it } from "vitest";
import {
  canEditProject,
  canViewProject,
  isProjectOwner,
  type ProjectAccessContext,
} from "./permissions.js";

const ctx = (over: Partial<ProjectAccessContext>): ProjectAccessContext => ({
  isPersonalOwner: false,
  teamRole: null,
  ...over,
});

describe("project access predicates", () => {
  it("personal owner can view, edit, and owns", () => {
    const c = ctx({ isPersonalOwner: true });
    expect(canViewProject(c)).toBe(true);
    expect(canEditProject(c)).toBe(true);
    expect(isProjectOwner(c)).toBe(true);
  });

  it("team owner can view, edit, and owns", () => {
    const c = ctx({ teamRole: "owner" });
    expect(canViewProject(c)).toBe(true);
    expect(canEditProject(c)).toBe(true);
    expect(isProjectOwner(c)).toBe(true);
  });

  it("team editor can view and edit but does not own", () => {
    const c = ctx({ teamRole: "editor" });
    expect(canViewProject(c)).toBe(true);
    expect(canEditProject(c)).toBe(true);
    expect(isProjectOwner(c)).toBe(false);
  });

  it("team viewer can view but not edit or own", () => {
    const c = ctx({ teamRole: "viewer" });
    expect(canViewProject(c)).toBe(true);
    expect(canEditProject(c)).toBe(false);
    expect(isProjectOwner(c)).toBe(false);
  });

  it("a non-member (no role, not personal owner) has no access", () => {
    const c = ctx({});
    expect(canViewProject(c)).toBe(false);
    expect(canEditProject(c)).toBe(false);
    expect(isProjectOwner(c)).toBe(false);
  });
});
