import { describe, it, expect } from "vitest";
import {
  moveSceneWithinSequence,
  moveSceneBetweenSequences,
  moveSequenceWithinAct,
  moveSequenceBetweenActs,
  moveAct,
} from "./outline-drag";
import type { OutlineContent } from "../documents.schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const scene = (id: string) => ({
  id,
  heading: "",
  description: "",
  characters: [],
  pageEstimate: null,
  notes: null,
});

const seq = (id: string, sceneIds: string[]) => ({
  id,
  title: id,
  scenes: sceneIds.map(scene),
});

const act = (id: string, seqIds: string[][]): OutlineContent["acts"][number] => ({
  id,
  title: id,
  sequences: seqIds.map(([sid, ...sceneIds]) => seq(sid!, sceneIds)),
});

const outline = (...actDefs: Array<[string, string[][], ...never[]]>): OutlineContent => ({
  acts: actDefs.map(([id, seqs]) => act(id, seqs)),
});

// ─── moveSceneWithinSequence ──────────────────────────────────────────────────

describe("moveSceneWithinSequence", () => {
  it("moves a scene down within its sequence", () => {
    const o = outline(["a1", [["s1", "sc1", "sc2", "sc3"]]]);
    const result = moveSceneWithinSequence(o, "a1", "s1", 0, 2);
    const scenes = result.acts[0]!.sequences[0]!.scenes.map((s) => s.id);
    expect(scenes).toEqual(["sc2", "sc3", "sc1"]);
  });

  it("moves a scene up within its sequence", () => {
    const o = outline(["a1", [["s1", "sc1", "sc2", "sc3"]]]);
    const result = moveSceneWithinSequence(o, "a1", "s1", 2, 0);
    const scenes = result.acts[0]!.sequences[0]!.scenes.map((s) => s.id);
    expect(scenes).toEqual(["sc3", "sc1", "sc2"]);
  });

  it("returns same reference when fromIndex equals toIndex", () => {
    const o = outline(["a1", [["s1", "sc1", "sc2"]]]);
    expect(moveSceneWithinSequence(o, "a1", "s1", 1, 1)).toBe(o);
  });

  it("does not mutate the original outline", () => {
    const o = outline(["a1", [["s1", "sc1", "sc2"]]]);
    moveSceneWithinSequence(o, "a1", "s1", 0, 1);
    expect(o.acts[0]!.sequences[0]!.scenes[0]!.id).toBe("sc1");
  });
});

// ─── moveSceneBetweenSequences ────────────────────────────────────────────────

describe("moveSceneBetweenSequences", () => {
  it("moves scene from one sequence to another in the same act", () => {
    const o = outline(["a1", [["s1", "sc1", "sc2"], ["s2", "sc3"]]]);
    const result = moveSceneBetweenSequences(o, "a1", "s1", "sc1", "a1", "s2", 0);
    expect(result.acts[0]!.sequences[0]!.scenes.map((s) => s.id)).toEqual(["sc2"]);
    expect(result.acts[0]!.sequences[1]!.scenes.map((s) => s.id)).toEqual(["sc1", "sc3"]);
  });

  it("moves scene from one act to another", () => {
    const o = outline(
      ["a1", [["s1", "sc1"]]],
      ["a2", [["s2", "sc2"]]],
    );
    const result = moveSceneBetweenSequences(o, "a1", "s1", "sc1", "a2", "s2", 1);
    expect(result.acts[0]!.sequences[0]!.scenes).toHaveLength(0);
    expect(result.acts[1]!.sequences[0]!.scenes.map((s) => s.id)).toEqual(["sc2", "sc1"]);
  });

  it("returns original when sceneId not found", () => {
    const o = outline(["a1", [["s1", "sc1"]]]);
    expect(moveSceneBetweenSequences(o, "a1", "s1", "MISSING", "a1", "s1", 0)).toBe(o);
  });
});

// ─── moveSequenceWithinAct ────────────────────────────────────────────────────

describe("moveSequenceWithinAct", () => {
  it("reorders sequences within an act", () => {
    const o = outline(["a1", [["s1"], ["s2"], ["s3"]]]);
    const result = moveSequenceWithinAct(o, "a1", 0, 2);
    expect(result.acts[0]!.sequences.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("returns same reference when fromIndex equals toIndex", () => {
    const o = outline(["a1", [["s1"], ["s2"]]]);
    expect(moveSequenceWithinAct(o, "a1", 1, 1)).toBe(o);
  });
});

// ─── moveSequenceBetweenActs ──────────────────────────────────────────────────

describe("moveSequenceBetweenActs", () => {
  it("moves a sequence from act 1 to act 2", () => {
    const o = outline(
      ["a1", [["s1"], ["s2"]]],
      ["a2", [["s3"]]],
    );
    const result = moveSequenceBetweenActs(o, "a1", "s2", "a2", 0);
    expect(result.acts[0]!.sequences.map((s) => s.id)).toEqual(["s1"]);
    expect(result.acts[1]!.sequences.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("returns original when seqId not found", () => {
    const o = outline(["a1", [["s1"]]]);
    expect(moveSequenceBetweenActs(o, "a1", "MISSING", "a1", 0)).toBe(o);
  });
});

// ─── moveAct ──────────────────────────────────────────────────────────────────

describe("moveAct", () => {
  it("moves an act to a lower position", () => {
    const o: OutlineContent = {
      acts: [
        { id: "a1", title: "a1", sequences: [] },
        { id: "a2", title: "a2", sequences: [] },
        { id: "a3", title: "a3", sequences: [] },
      ],
    };
    const result = moveAct(o, 0, 2);
    expect(result.acts.map((a) => a.id)).toEqual(["a2", "a3", "a1"]);
  });

  it("returns same reference when fromIndex equals toIndex", () => {
    const o: OutlineContent = {
      acts: [{ id: "a1", title: "a1", sequences: [] }],
    };
    expect(moveAct(o, 0, 0)).toBe(o);
  });
});

// ─── Schema backfill (parseOutline) ──────────────────────────────────────────

describe("parseOutline backfill", () => {
  it("backfills missing heading and pageEstimate from legacy data", async () => {
    const { parseOutline } = await import("../documents.schema");
    const legacy = JSON.stringify({
      acts: [
        {
          id: "a1",
          title: "Act I",
          sequences: [
            {
              id: "s1",
              title: "Seq 1",
              scenes: [
                { id: "sc1", description: "old", characters: [], notes: "" },
              ],
            },
          ],
        },
      ],
    });
    const result = parseOutline(legacy);
    const scene = result.acts[0]!.sequences[0]!.scenes[0]!;
    expect(scene.heading).toBe("");
    expect(scene.pageEstimate).toBeNull();
    expect(scene.notes).toBe("");
    expect(scene.description).toBe("old");
  });
});
