import { describe, it, expect } from "vitest";
import { parseAvatarUrl } from "./helpers";

describe("parseAvatarUrl", () => {
  it("accepts a well-formed http(s) URL", () => {
    expect(
      parseAvatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c"),
    ).toBe("https://lh3.googleusercontent.com/a/abc=s96-c");
  });

  it("rejects null and undefined", () => {
    expect(parseAvatarUrl(null)).toBeNull();
    expect(parseAvatarUrl(undefined)).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(parseAvatarUrl("")).toBeNull();
  });

  it("rejects a non-URL string", () => {
    expect(parseAvatarUrl("not a url")).toBeNull();
  });

  it("rejects a non-http scheme", () => {
    expect(parseAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(parseAvatarUrl("data:image/png;base64,abc")).toBeNull();
    expect(parseAvatarUrl("ftp://example.com/avatar.png")).toBeNull();
  });
});
