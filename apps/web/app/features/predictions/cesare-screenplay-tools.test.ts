import { describe, it, expect } from "vitest";
import {
  countWholeWordOccurrences,
  clampSceneRange,
  sliceFountainSceneRange,
  executeScreenplayTool,
} from "./cesare-screenplay-tools";

describe("countWholeWordOccurrences", () => {
  it("counts a single whole-word match (case-insensitive)", () => {
    expect(countWholeWordOccurrences("Mario entra in casa", "mario")).toBe(1);
  });

  it("counts multiple whole-word matches across the text", () => {
    const text = "MARIO parla. Mario ride. mario fugge. Mariolino tace.";
    // The four "Mario" tokens are counted; "Mariolino" must not match.
    expect(countWholeWordOccurrences(text, "Mario")).toBe(3);
  });

  it("does not match substrings inside larger words", () => {
    expect(countWholeWordOccurrences("smartphone smartworking", "smart")).toBe(
      0,
    );
  });

  it("returns 0 when needle is empty", () => {
    expect(countWholeWordOccurrences("anything", "")).toBe(0);
  });

  it("escapes regex special characters in the needle", () => {
    expect(countWholeWordOccurrences("foo a.b bar", "a.b")).toBe(1);
    // The needle "a*b" should not regex-multi-match the literal text.
    expect(countWholeWordOccurrences("foo aaab bar", "a*b")).toBe(0);
  });
});

describe("clampSceneRange", () => {
  it("returns the range unchanged when within bounds", () => {
    expect(clampSceneRange(2, 5, 10)).toEqual({ from: 2, to: 5 });
  });

  it("clamps to >= 1 on the low end", () => {
    expect(clampSceneRange(-1, 3, 10)).toEqual({ from: 1, to: 3 });
  });

  it("clamps to totalScenes on the high end", () => {
    expect(clampSceneRange(2, 99, 10)).toEqual({ from: 2, to: 10 });
  });

  it("swaps reversed arguments so from <= to", () => {
    expect(clampSceneRange(7, 3, 10)).toEqual({ from: 3, to: 7 });
  });

  it("collapses to a single scene when both ends clamp past total", () => {
    expect(clampSceneRange(20, 30, 5)).toEqual({ from: 5, to: 5 });
  });
});

describe("executeScreenplayTool — rewrite_scene marker transport", () => {
  // rewrite_scene does not use db or projectId; cast null to satisfy the type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = null as any;

  it("embeds a base64-encoded marker (no raw JSON in the HTML comment)", async () => {
    const result = await executeScreenplayTool(
      {
        type: "tool_use",
        id: "test-id",
        name: "rewrite_scene",
        input: {
          scene_number: 1,
          new_content: "INT. STANZA - NOTTE\n\nRICK entra.",
        },
      },
      db,
      "proj-1",
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const payload = JSON.parse(result.value.content) as {
      scene_number: number;
      accepted: boolean;
      marker: string;
    };
    // Marker must use the -b64 variant and contain only base64 chars.
    expect(payload.marker).toMatch(
      /<!--ohw:rewrite-scene-b64:[A-Za-z0-9+/=]+-->/,
    );
    // Raw JSON must NOT appear verbatim inside the HTML comment.
    expect(payload.marker).not.toMatch(/<!--ohw:rewrite-scene:\{/);
  });

  it("roundtrips the payload through base64 correctly", async () => {
    const newContent = "EXT. STRADA - GIORNO\n\nMario corre veloce.";
    const result = await executeScreenplayTool(
      {
        type: "tool_use",
        id: "test-id-2",
        name: "rewrite_scene",
        input: { scene_number: 3, new_content: newContent },
      },
      db,
      "proj-1",
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const payload = JSON.parse(result.value.content) as { marker: string };
    const m = payload.marker.match(
      /<!--ohw:rewrite-scene-b64:([A-Za-z0-9+/=]+)-->/,
    );
    expect(m).not.toBeNull();
    const decoded = JSON.parse(
      Buffer.from(m![1]!, "base64").toString("utf8"),
    ) as {
      scene_number: number;
      new_content: string;
    };
    expect(decoded.scene_number).toBe(3);
    expect(decoded.new_content).toBe(newContent);
  });

  it("base64 marker survives Fountain transition syntax inside new_content", async () => {
    // --> CUT TO: inside new_content previously terminated the HTML comment early.
    const newContent =
      "INT. STUDIO - NOTTE\n\n--> CUT TO:\n\nEXT. STRADA - GIORNO";
    const result = await executeScreenplayTool(
      {
        type: "tool_use",
        id: "test-id-3",
        name: "rewrite_scene",
        input: { scene_number: 2, new_content: newContent },
      },
      db,
      "proj-1",
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const payload = JSON.parse(result.value.content) as { marker: string };
    const m = payload.marker.match(
      /<!--ohw:rewrite-scene-b64:([A-Za-z0-9+/=]+)-->/,
    );
    expect(m).not.toBeNull();
    const decoded = JSON.parse(
      Buffer.from(m![1]!, "base64").toString("utf8"),
    ) as {
      scene_number: number;
      new_content: string;
    };
    expect(decoded.new_content).toBe(newContent);
  });

  it("returns an error when scene_number is not a positive integer", async () => {
    const result = await executeScreenplayTool(
      {
        type: "tool_use",
        id: "test-id-4",
        name: "rewrite_scene",
        input: { scene_number: -1, new_content: "some content" },
      },
      db,
      "proj-1",
    );
    expect(result.isErr()).toBe(true);
  });

  it("returns an error when new_content is empty", async () => {
    const result = await executeScreenplayTool(
      {
        type: "tool_use",
        id: "test-id-5",
        name: "rewrite_scene",
        input: { scene_number: 1, new_content: "   " },
      },
      db,
      "proj-1",
    );
    expect(result.isErr()).toBe(true);
  });
});

describe("sliceFountainSceneRange", () => {
  const fountain = [
    "Title: Esempio",
    "",
    "INT. CUCINA - GIORNO",
    "",
    "Mario entra.",
    "",
    "EXT. STRADA - NOTTE",
    "",
    "Mario corre.",
    "",
    "INT. UFFICIO - GIORNO",
    "",
    "Lucia lavora.",
  ].join("\n");

  it("slices the first scene only", () => {
    const { slice, before, after } = sliceFountainSceneRange(fountain, 1, 1);
    expect(slice).toContain("INT. CUCINA");
    expect(slice).toContain("Mario entra");
    expect(slice).not.toContain("EXT. STRADA");
    expect(before).toContain("Title: Esempio");
    expect(after).toContain("EXT. STRADA");
  });

  it("slices the middle scene", () => {
    const { slice } = sliceFountainSceneRange(fountain, 2, 2);
    expect(slice).toContain("EXT. STRADA");
    expect(slice).toContain("Mario corre");
    expect(slice).not.toContain("INT. CUCINA");
    expect(slice).not.toContain("INT. UFFICIO");
  });

  it("slices a range covering multiple consecutive scenes", () => {
    const { slice } = sliceFountainSceneRange(fountain, 2, 3);
    expect(slice).toContain("EXT. STRADA");
    expect(slice).toContain("INT. UFFICIO");
    expect(slice).not.toContain("INT. CUCINA");
  });

  it("returns the full text when there are no sluglines", () => {
    const text = "Just prose, no scene headers here.";
    const { slice, before, after } = sliceFountainSceneRange(text, 1, 1);
    expect(slice).toBe(text);
    expect(before).toBe("");
    expect(after).toBe("");
  });

  it("clamps the upper bound to the number of available scenes", () => {
    const { slice } = sliceFountainSceneRange(fountain, 1, 99);
    expect(slice).toContain("INT. CUCINA");
    expect(slice).toContain("INT. UFFICIO");
  });
});
