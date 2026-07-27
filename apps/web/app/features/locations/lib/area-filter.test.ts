import { describe, it, expect } from "vitest";
import {
  filterCandidatesInPolygon,
  collectAllCandidates,
  geometryToCircle,
  clampDiscoveryRadius,
  DISCOVERY_MIN_RADIUS_M,
  DISCOVERY_MAX_RADIUS_M,
} from "./area-filter";

// A 1°×1° square around [0,0] → [1,1].
const square: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

describe("filterCandidatesInPolygon", () => {
  it("keeps candidates inside the polygon", () => {
    const ids = filterCandidatesInPolygon(
      [{ id: "in", lat: 0.5, lng: 0.5 }],
      square,
    );
    expect(ids).toEqual(["in"]);
  });

  it("drops candidates outside the polygon", () => {
    const ids = filterCandidatesInPolygon(
      [{ id: "out", lat: 5, lng: 5 }],
      square,
    );
    expect(ids).toEqual([]);
  });

  it("excludes candidates without coordinates", () => {
    const ids = filterCandidatesInPolygon(
      [{ id: "nocoord", lat: null, lng: undefined }],
      square,
    );
    expect(ids).toEqual([]);
  });

  it("returns empty for a non-polygon geometry", () => {
    const ids = filterCandidatesInPolygon([{ id: "in", lat: 0.5, lng: 0.5 }], {
      type: "Point",
      coordinates: [0.5, 0.5],
    });
    expect(ids).toEqual([]);
  });

  it("partitions a mixed set correctly", () => {
    const ids = filterCandidatesInPolygon(
      [
        { id: "in", lat: 0.2, lng: 0.2 },
        { id: "out", lat: 9, lng: 9 },
        { id: "edge", lat: 0.99, lng: 0.99 },
      ],
      square,
    );
    expect(ids.sort()).toEqual(["edge", "in"]);
  });
});

describe("collectAllCandidates", () => {
  it("flattens candidates across requirements", () => {
    const result = collectAllCandidates([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { candidates: [{ id: "a" } as any, { id: "b" } as any] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { candidates: [{ id: "c" } as any] },
    ]);
    expect(result.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

// #68 — an unclamped radius was rejected by the discovery validator inside an
// unguarded promise: no pins appeared and nothing was said. The bounds are
// enforced where the radius is derived, so no caller has to remember them.
describe("geometryToCircle radius clamping", () => {
  const boxAround = (halfDeg: number): GeoJSON.Polygon => ({
    type: "Polygon",
    coordinates: [
      [
        [-halfDeg, -halfDeg],
        [halfDeg, -halfDeg],
        [halfDeg, halfDeg],
        [-halfDeg, halfDeg],
        [-halfDeg, -halfDeg],
      ],
    ],
  });

  it("clamps a region-sized boundary to the discovery maximum", () => {
    // ~5° half-width is several hundred km — far past the 50 km limit.
    const circle = geometryToCircle(boxAround(5));
    expect(circle).not.toBeNull();
    expect(circle!.radius_m).toBe(DISCOVERY_MAX_RADIUS_M);
  });

  it("raises a degenerate polygon to the discovery minimum", () => {
    // A zero-area polygon yields radius 0, which the validator also rejects.
    const circle = geometryToCircle(boxAround(0));
    expect(circle).not.toBeNull();
    expect(circle!.radius_m).toBe(DISCOVERY_MIN_RADIUS_M);
  });

  it("leaves a radius inside the range untouched (bar rounding)", () => {
    const circle = geometryToCircle(boxAround(0.1));
    expect(circle!.radius_m).toBeGreaterThan(DISCOVERY_MIN_RADIUS_M);
    expect(circle!.radius_m).toBeLessThan(DISCOVERY_MAX_RADIUS_M);
  });

  it("clamps both ends", () => {
    expect(clampDiscoveryRadius(0)).toBe(DISCOVERY_MIN_RADIUS_M);
    expect(clampDiscoveryRadius(9_999_999)).toBe(DISCOVERY_MAX_RADIUS_M);
    expect(clampDiscoveryRadius(1_234.6)).toBe(1_235);
  });
});
