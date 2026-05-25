import { describe, it, expect } from "vitest";
import { filterCandidatesInPolygon, collectAllCandidates } from "./area-filter";

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
