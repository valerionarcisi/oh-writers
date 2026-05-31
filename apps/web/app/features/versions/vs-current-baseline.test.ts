import { describe, it, expect } from "vitest";
import { resolveCurrentVersionId } from "./vs-current-baseline";

// [OHW-audit-F-versions] F-A1: the "vs current" baseline must resolve even when
// `?vcur=` is absent, so a bare `?versions=` deep-link shows the vs-current diff.
describe("resolveCurrentVersionId", () => {
  // Newest-first, as the server orders versions (descending number).
  const versions = [{ id: "v3" }, { id: "v2" }, { id: "v1" }];

  it("falls back to the most recent version when vcur is null (bare deep-link)", () => {
    expect(resolveCurrentVersionId(versions, null)).toBe("v3");
  });

  it("honours a vcur that resolves to one of the document's versions", () => {
    expect(resolveCurrentVersionId(versions, "v2")).toBe("v2");
  });

  it("falls back to the most recent version when vcur is foreign/unresolved", () => {
    expect(resolveCurrentVersionId(versions, "not-a-version")).toBe("v3");
  });

  it("returns null only when there are no versions", () => {
    expect(resolveCurrentVersionId([], null)).toBe(null);
    expect(resolveCurrentVersionId([], "v1")).toBe(null);
  });
});
