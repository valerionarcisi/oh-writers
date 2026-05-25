import { describe, it, expect } from "vitest";
import {
  buildDiscoveredPlaces,
  placeTypesForRequirements,
  type DiscoveryPlace,
  type SavedPoint,
} from "./discovery";
import {
  LOCATION_CATEGORIES,
  type RequirementForMatch,
  type LocationType,
} from "@oh-writers/domain";

const place = (over: Partial<DiscoveryPlace> = {}): DiscoveryPlace => ({
  placeId: "p1",
  name: "Trattoria da Gino",
  address: "Via Roma 1",
  lat: 43.5,
  lng: 13.5,
  types: ["restaurant"],
  ...over,
});

const reqs: RequirementForMatch[] = [
  { id: "r1", name: "Ristorante", locationType: "ristorante", sceneCount: 3 },
  { id: "r2", name: "Bancone", locationType: "bar", sceneCount: 1 },
];

describe("buildDiscoveredPlaces", () => {
  it("attaches the matching requirement to a place", () => {
    const [d] = buildDiscoveredPlaces([place()], [], reqs);
    expect(d!.matches.map((m) => m.requirementId)).toEqual(["r1"]);
    expect(d!.matches[0]!.sceneCount).toBe(3);
  });

  it("drops a place that duplicates a saved candidate (close + same name)", () => {
    const saved: SavedPoint[] = [
      { name: "Trattoria da Gino", lat: 43.5, lng: 13.5 },
    ];
    expect(buildDiscoveredPlaces([place()], saved, reqs)).toEqual([]);
  });

  it("keeps a place near a saved candidate with a different name", () => {
    const saved: SavedPoint[] = [{ name: "Bar Sport", lat: 43.5, lng: 13.5 }];
    expect(buildDiscoveredPlaces([place()], saved, reqs)).toHaveLength(1);
  });

  it("keeps a same-name place that is far away", () => {
    const saved: SavedPoint[] = [
      { name: "Trattoria da Gino", lat: 44.0, lng: 14.0 },
    ];
    expect(buildDiscoveredPlaces([place()], saved, reqs)).toHaveLength(1);
  });

  it("returns a place with no matches when nothing fits", () => {
    const [d] = buildDiscoveredPlaces(
      [place({ name: "Distributore", types: ["gas_station"] })],
      [],
      reqs,
    );
    expect(d!.matches).toEqual([]);
  });
});

describe("placeTypesForRequirements", () => {
  it("unions the Google types of all resolved requirement types", () => {
    const types = placeTypesForRequirements(
      [{ locationType: "ristorante" }, { locationType: "bar" }],
      (t: LocationType) => LOCATION_CATEGORIES[t].placeTypes,
    );
    expect(types).toContain("restaurant");
    expect(types).toContain("bar");
  });

  it("dedupes overlapping types", () => {
    const types = placeTypesForRequirements(
      [{ locationType: "ristorante" }, { locationType: "ristorante" }],
      (t: LocationType) => LOCATION_CATEGORIES[t].placeTypes,
    );
    expect(new Set(types).size).toBe(types.length);
  });
});
