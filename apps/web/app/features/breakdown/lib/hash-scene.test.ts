import { describe, it, expect } from "vitest";
import { hashSceneText } from "./hash-scene";

describe("hashSceneText", () => {
  it("normalizes whitespace and lowercase before hashing", () => {
    expect(hashSceneText("Hello World")).toBe(hashSceneText("hello   world"));
    expect(hashSceneText("a\nb")).toBe(hashSceneText("a b"));
  });

  it("returns 64-char hex (sha256)", () => {
    expect(hashSceneText("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differentiates content changes", () => {
    expect(hashSceneText("hello")).not.toBe(hashSceneText("hello world"));
  });
});
