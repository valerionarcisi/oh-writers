import { describe, it, expect } from "vitest";
import type { ActorPosition, CameraPin } from "@oh-writers/domain";
import { parseBlockingProposal } from "./cesare-shooting-plan-tools";

const sceneId = "00000000-0000-4000-a000-000000000001";

const actor = (overrides: Partial<ActorPosition> = {}): ActorPosition => ({
  castId: "cast-1",
  label: "GIULIO",
  x: 100,
  y: 200,
  arrow: null,
  ...overrides,
});

const camera = (overrides: Partial<CameraPin> = {}): CameraPin => ({
  shotId: "shot-1",
  label: "A · WS",
  x: 350,
  y: 100,
  coneAngle: 60,
  coneDirection: 180,
  movement: null,
  ...overrides,
});

describe("parseBlockingProposal", () => {
  it("turns actor positions and camera pins into a wire-friendly payload", () => {
    const proposal = parseBlockingProposal(
      sceneId,
      [actor(), actor({ castId: "cast-2", label: "TEA", x: 150, y: 220 })],
      [camera()],
      "prop-123",
    );

    expect(proposal.proposalId).toBe("prop-123");
    expect(proposal.sceneId).toBe(sceneId);
    expect(proposal.suggestions).toHaveLength(3);

    const actors = proposal.suggestions.filter((s) => s.kind === "actor");
    const cameras = proposal.suggestions.filter((s) => s.kind === "camera");
    expect(actors).toHaveLength(2);
    expect(cameras).toHaveLength(1);
  });

  it("preserves actor coordinates and label", () => {
    const proposal = parseBlockingProposal(sceneId, [actor()], [], "p");
    const a = proposal.suggestions[0];
    if (!a || a.kind !== "actor") throw new Error("expected actor suggestion");
    expect(a.castId).toBe("cast-1");
    expect(a.label).toBe("GIULIO");
    expect(a.x).toBe(100);
    expect(a.y).toBe(200);
  });

  it("preserves camera cone angle and direction", () => {
    const proposal = parseBlockingProposal(
      sceneId,
      [],
      [camera({ coneAngle: 45, coneDirection: 90 })],
      "p",
    );
    const c = proposal.suggestions[0];
    if (!c || c.kind !== "camera")
      throw new Error("expected camera suggestion");
    expect(c.coneAngle).toBe(45);
    expect(c.coneDirection).toBe(90);
    expect(c.shotId).toBe("shot-1");
  });

  it("returns an empty list when both inputs are empty", () => {
    const proposal = parseBlockingProposal(sceneId, [], [], "p-empty");
    expect(proposal.suggestions).toEqual([]);
    expect(proposal.proposalId).toBe("p-empty");
  });

  it("places actors before cameras in the suggestion order", () => {
    const proposal = parseBlockingProposal(sceneId, [actor()], [camera()], "p");
    expect(proposal.suggestions[0]?.kind).toBe("actor");
    expect(proposal.suggestions[1]?.kind).toBe("camera");
  });

  it("handles multiple cameras", () => {
    const proposal = parseBlockingProposal(
      sceneId,
      [],
      [
        camera({ shotId: "shot-1", label: "A · WS" }),
        camera({ shotId: "shot-2", label: "B · CU" }),
        camera({ shotId: "shot-3", label: "C · OTS" }),
      ],
      "p",
    );
    const cameras = proposal.suggestions.filter((s) => s.kind === "camera");
    expect(cameras).toHaveLength(3);
    expect(cameras.map((c) => (c.kind === "camera" ? c.label : null))).toEqual([
      "A · WS",
      "B · CU",
      "C · OTS",
    ]);
  });
});
