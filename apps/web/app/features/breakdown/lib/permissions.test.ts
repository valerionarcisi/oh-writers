import { describe, it, expect } from "vitest";
import { canEditBreakdown, canViewBreakdown } from "./permissions";

describe("canEditBreakdown", () => {
  it("owner can edit", () => {
    expect(canEditBreakdown({ isPersonalOwner: true, teamRole: null })).toBe(
      true,
    );
  });
  it("editor can edit", () => {
    expect(
      canEditBreakdown({ isPersonalOwner: false, teamRole: "editor" }),
    ).toBe(true);
  });
  it("team owner can edit", () => {
    expect(
      canEditBreakdown({ isPersonalOwner: false, teamRole: "owner" }),
    ).toBe(true);
  });
  it("viewer cannot edit", () => {
    expect(
      canEditBreakdown({ isPersonalOwner: false, teamRole: "viewer" }),
    ).toBe(false);
  });
  it("non-member cannot edit", () => {
    expect(canEditBreakdown({ isPersonalOwner: false, teamRole: null })).toBe(
      false,
    );
  });
});

describe("canViewBreakdown", () => {
  it("personal owner can view", () => {
    expect(canViewBreakdown({ isPersonalOwner: true, teamRole: null })).toBe(
      true,
    );
  });
  it("any team member can view", () => {
    expect(
      canViewBreakdown({ isPersonalOwner: false, teamRole: "viewer" }),
    ).toBe(true);
  });
  it("non-member cannot view", () => {
    expect(canViewBreakdown({ isPersonalOwner: false, teamRole: null })).toBe(
      false,
    );
  });
});
