import { describe, it, expect } from "vitest";
import {
  PrimitiveSchema,
  ActorPositionSchema,
  CameraPinSchema,
  PrimitivesArraySchema,
} from "./blocking.types";

describe("PrimitiveSchema", () => {
  it("parses a wall primitive", () => {
    const result = PrimitiveSchema.safeParse({ type: "wall", x: 0, y: 0, w: 100, h: 50 });
    expect(result.success).toBe(true);
  });

  it("parses a furniture primitive with propRef null", () => {
    const result = PrimitiveSchema.safeParse({
      type: "furniture", x: 10, y: 20, w: 80, h: 60, label: "Tavolo", propRef: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses an opening primitive", () => {
    const result = PrimitiveSchema.safeParse({
      type: "opening", x: 50, y: 0, w: 100, h: 50, kind: "door",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown type", () => {
    const result = PrimitiveSchema.safeParse({ type: "circle", x: 0, y: 0 });
    expect(result.success).toBe(false);
  });
});

describe("ActorPositionSchema", () => {
  it("parses with arrow null", () => {
    const result = ActorPositionSchema.safeParse({
      castId: "abc", label: "Giulia", x: 100, y: 200, arrow: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses with arrow present", () => {
    const result = ActorPositionSchema.safeParse({
      castId: "abc", label: "Giulia", x: 100, y: 200,
      arrow: { toX: 300, toY: 400 },
    });
    expect(result.success).toBe(true);
  });
});

describe("CameraPinSchema", () => {
  it("parses full camera pin", () => {
    const result = CameraPinSchema.safeParse({
      shotId: "s1", label: "A · MASTER", x: 500, y: 600,
      coneAngle: 45, coneDirection: 180, movement: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("PrimitivesArraySchema", () => {
  it("parses empty array", () => {
    expect(PrimitivesArraySchema.safeParse([]).success).toBe(true);
  });
});
