// apps/web/app/features/app-shell/nav-guard.test.ts
//
// `resolveProjectIdForNav` is the single guard every `/projects/$id/...`
// navigation runs before building its route. Building a project route from an
// absent id yields `/projects/undefined/...`, which matches no route and sends
// the router into a re-match storm ("Maximum update depth" + repeated
// `/projects/undefined/*` matches — the Bug 2 / 3a loop family). This locks the
// guard's contract.

import { describe, it, expect } from "vitest";
import { resolveProjectIdForNav } from "./nav";

describe("resolveProjectIdForNav — never build /projects/undefined/*", () => {
  it("returns a real project id unchanged", () => {
    expect(resolveProjectIdForNav("00000000-0000-4000-a000-000000000012")).toBe(
      "00000000-0000-4000-a000-000000000012",
    );
  });

  it("returns null for null / undefined (no project in context)", () => {
    expect(resolveProjectIdForNav(null)).toBeNull();
    expect(resolveProjectIdForNav(undefined)).toBeNull();
  });

  it("returns null for an empty / whitespace id", () => {
    expect(resolveProjectIdForNav("")).toBeNull();
    expect(resolveProjectIdForNav("   ")).toBeNull();
  });

  it('rejects the literal strings "undefined" / "null" (a stringified id)', () => {
    // The exact shape that produced `/projects/undefined/screenplay` in the loop.
    expect(resolveProjectIdForNav("undefined")).toBeNull();
    expect(resolveProjectIdForNav("null")).toBeNull();
  });

  it("trims surrounding whitespace on a real id", () => {
    expect(resolveProjectIdForNav("  abc  ")).toBe("abc");
  });
});
