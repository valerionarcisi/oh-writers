import { describe, it, expect } from "vitest";
import { hashText } from "./hash";

describe("hashText", () => {
  it("normalizes whitespace and lowercase before hashing", () => {
    expect(hashText("Hello World")).toBe(hashText("hello   world"));
    expect(hashText("a\nb")).toBe(hashText("a b"));
  });

  it("returns 64-char hex (sha256)", () => {
    expect(hashText("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differentiates content changes", () => {
    expect(hashText("hello")).not.toBe(hashText("hello world"));
  });
});
