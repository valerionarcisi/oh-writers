import { describe, expect, it } from "vitest";
import { parseRoomId } from "./room-id.js";

describe("parseRoomId", () => {
  it("parses a screenplay room", () => {
    expect(parseRoomId("screenplay:abc-123")).toEqual({
      kind: "screenplay",
      id: "abc-123",
    });
  });

  it("parses a branch room", () => {
    expect(parseRoomId("branch:b-1")).toEqual({ kind: "branch", id: "b-1" });
  });

  it("parses a document room", () => {
    expect(parseRoomId("document:doc-9")).toEqual({
      kind: "document",
      id: "doc-9",
    });
  });

  it("keeps colons inside the id", () => {
    expect(parseRoomId("document:a:b")).toEqual({
      kind: "document",
      id: "a:b",
    });
  });

  it("rejects an unknown kind", () => {
    expect(parseRoomId("budget:x")).toBeNull();
  });

  it("rejects a missing id", () => {
    expect(parseRoomId("screenplay:")).toBeNull();
  });

  it("rejects a string with no separator", () => {
    expect(parseRoomId("screenplay")).toBeNull();
  });

  it("rejects a leading separator", () => {
    expect(parseRoomId(":abc")).toBeNull();
  });

  it("rejects the empty string", () => {
    expect(parseRoomId("")).toBeNull();
  });
});
