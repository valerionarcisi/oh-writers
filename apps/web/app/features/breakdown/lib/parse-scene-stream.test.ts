import { describe, it, expect } from "vitest";
import {
  extractCompleteScenes,
  type ParsedSceneRaw,
} from "./parse-scene-stream";

// The parser is fed an ever-growing buffer of JSON text emitted by the
// Anthropic tool_use input_json_delta stream. The shape we negotiate with
// the model is `{ scenes: [{ sceneNumber, items: [...] }, ...] }`. The
// parser yields completed scenes one at a time.
//
// The parser is intentionally permissive: it ignores everything outside
// the `scenes` array bracket and only tries to close `{...}` objects that
// belong to that array.
describe("extractCompleteScenes", () => {
  it("returns no scenes for an empty buffer", () => {
    expect(extractCompleteScenes("", 0)).toEqual({
      scenes: [],
      nextCursor: 0,
    });
  });

  it("returns no scenes when array hasn't opened yet", () => {
    expect(extractCompleteScenes('{"scenes":', 0)).toEqual({
      scenes: [],
      nextCursor: 0,
    });
  });

  it("returns no scenes when first object is partial", () => {
    // Cursor advances past the array opener so the next call doesn't
    // re-scan from byte 0, but no completed scenes yet.
    const { scenes } = extractCompleteScenes(
      '{"scenes":[{"sceneNumber":1,"items":[',
      0,
    );
    expect(scenes).toEqual([]);
  });

  it("yields one complete scene", () => {
    const buf = '{"scenes":[{"sceneNumber":1,"items":[]}';
    const { scenes, nextCursor } = extractCompleteScenes(buf, 0);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toEqual({ sceneNumber: 1, items: [] });
    expect(nextCursor).toBe(buf.length);
  });

  it("yields multiple complete scenes from a single buffer", () => {
    const buf =
      '{"scenes":[{"sceneNumber":1,"items":[]},{"sceneNumber":2,"items":[{"name":"Mic","category":"props","quantity":1,"confidence":0.9}]}';
    const { scenes } = extractCompleteScenes(buf, 0);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.sceneNumber).toBe(1);
    expect(scenes[1]?.sceneNumber).toBe(2);
    expect(scenes[1]?.items[0]?.name).toBe("Mic");
  });

  it("respects the cursor and only yields newly-completed scenes", () => {
    const buf =
      '{"scenes":[{"sceneNumber":1,"items":[]},{"sceneNumber":2,"items":[]}';
    // First call yields scene 1.
    const first = extractCompleteScenes(buf.slice(0, 39), 0);
    expect(first.scenes).toHaveLength(1);
    // Second call starts from where first ended and yields scene 2 only.
    const second = extractCompleteScenes(buf, first.nextCursor);
    expect(second.scenes).toHaveLength(1);
    expect(second.scenes[0]?.sceneNumber).toBe(2);
  });

  it("does not count braces inside string values", () => {
    const buf = '{"scenes":[{"sceneNumber":1,"items":[{"name":"a } b }"}]}';
    const { scenes } = extractCompleteScenes(buf, 0);
    // Object closes only after the real outer `}`, not after the `}` in the string.
    expect(scenes).toHaveLength(1);
  });

  it("handles escaped quotes inside string values", () => {
    const buf =
      '{"scenes":[{"sceneNumber":1,"items":[{"name":"He said \\"hi\\""}]}';
    const { scenes } = extractCompleteScenes(buf, 0);
    expect(scenes).toHaveLength(1);
    const first: ParsedSceneRaw | undefined = scenes[0];
    expect(first?.items[0]?.name).toBe('He said "hi"');
  });

  it("skips malformed scene objects and continues with valid ones", () => {
    // First scene is invalid JSON (missing colon); parser should skip and
    // keep the cursor advancing so it doesn't loop forever.
    const buf =
      '{"scenes":[{"sceneNumber" 1,"items":[]},{"sceneNumber":2,"items":[]}';
    const { scenes } = extractCompleteScenes(buf, 0);
    expect(scenes.map((s) => s.sceneNumber)).toEqual([2]);
  });

  it("handles whitespace and commas between objects", () => {
    const buf =
      '{ "scenes" : [\n  {"sceneNumber":1,"items":[]} ,\n  {"sceneNumber":2,"items":[]}';
    const { scenes } = extractCompleteScenes(buf, 0);
    expect(scenes.map((s) => s.sceneNumber)).toEqual([1, 2]);
  });

  it("ignores scenes without a numeric sceneNumber", () => {
    const buf = '{"scenes":[{"items":[]},{"sceneNumber":2,"items":[]}';
    const { scenes } = extractCompleteScenes(buf, 0);
    expect(scenes.map((s) => s.sceneNumber)).toEqual([2]);
  });
});
