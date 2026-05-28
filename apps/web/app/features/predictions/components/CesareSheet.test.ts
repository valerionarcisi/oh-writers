import { describe, it, expect } from "vitest";
import { parseToolsExecuted, parseRewriteSceneMarker } from "./CesareSheet";

describe("parseToolsExecuted", () => {
  it("returns 0 when the marker is absent", () => {
    expect(parseToolsExecuted("just a reply")).toBe(0);
  });

  it("parses single-digit tool counts", () => {
    expect(parseToolsExecuted("reply <!--ohw:tools=3-->")).toBe(3);
  });

  it("parses multi-digit tool counts", () => {
    expect(parseToolsExecuted("text <!--ohw:tools=42-->")).toBe(42);
  });

  it("ignores malformed markers", () => {
    expect(parseToolsExecuted("<!--ohw:tools=foo-->")).toBe(0);
  });
});

describe("parseRewriteSceneMarker", () => {
  const encode = (obj: unknown): string => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };

  it("returns null when no marker is present", () => {
    expect(parseRewriteSceneMarker("plain text")).toBeNull();
  });

  it("decodes a valid base64 marker", () => {
    const payload = { scene_number: 5, new_content: "INT. STANZA - GIORNO" };
    const marker = `prefix <!--ohw:rewrite-scene-b64:${encode(payload)}--> suffix`;
    expect(parseRewriteSceneMarker(marker)).toEqual(payload);
  });

  it("rejects payloads with wrong field types", () => {
    const bad = { scene_number: "5", new_content: "" };
    const marker = `<!--ohw:rewrite-scene-b64:${encode(bad)}-->`;
    expect(parseRewriteSceneMarker(marker)).toBeNull();
  });
});
