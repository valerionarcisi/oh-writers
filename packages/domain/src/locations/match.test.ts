import { describe, it, expect } from "vitest";
import {
  resolveTypeByKeyword,
  matchPlaceToRequirement,
  buildAffinities,
  type RequirementForMatch,
  type PlaceForMatch,
} from "./match.js";

describe("resolveTypeByKeyword", () => {
  it("resolves a clean category name", () => {
    expect(resolveTypeByKeyword("Ristorante - Forno")).toBe("ristorante");
  });

  it("resolves a name with noise around the keyword", () => {
    expect(resolveTypeByKeyword("Appartamento Marta")).toBe("appartamento");
  });

  it("is accent and case insensitive", () => {
    expect(resolveTypeByKeyword("CAFFÈ del corso")).toBe("bar");
  });

  it("returns null for a set name with no keyword (Haiku fallback)", () => {
    expect(resolveTypeByKeyword("Angolo Open Grezzo")).toBeNull();
  });

  it("returns null for a non-physical requirement", () => {
    expect(resolveTypeByKeyword("Montage di Filippo che lavora")).toBeNull();
  });

  it("does not substring-match a keyword inside a longer word (pub vs pubblico)", () => {
    expect(resolveTypeByKeyword("Pubblico che ride")).toBeNull();
  });

  it("does not resolve ambiguous generic interiors — they go to Haiku", () => {
    expect(resolveTypeByKeyword("Sala")).toBeNull();
    expect(resolveTypeByKeyword("Cucina")).toBeNull();
  });
});

describe("matchPlaceToRequirement", () => {
  it("scores highest on place-type intersection", () => {
    expect(
      matchPlaceToRequirement({
        requirementType: "ristorante",
        placeName: "Da Mario",
        placeAddress: "Via Roma 1",
        placeTypes: ["restaurant"],
      }),
    ).toEqual({ score: 0.9, source: "placeType" });
  });

  it("falls back to keyword when no place types (saved candidate)", () => {
    expect(
      matchPlaceToRequirement({
        requirementType: "ristorante",
        placeName: "Trattoria del Cerchio",
        placeAddress: null,
        placeTypes: [],
      }),
    ).toEqual({ score: 0.7, source: "keyword" });
  });

  it("matches keyword accent-insensitively in the address", () => {
    expect(
      matchPlaceToRequirement({
        requirementType: "bar",
        placeName: "Centrale",
        placeAddress: "Caffè storico, Piazza",
        placeTypes: [],
      }),
    ).toEqual({ score: 0.7, source: "keyword" });
  });

  it("returns none when nothing matches", () => {
    expect(
      matchPlaceToRequirement({
        requirementType: "spiaggia",
        placeName: "Ufficio Postale",
        placeAddress: "Via Verdi",
        placeTypes: ["post_office"],
      }),
    ).toEqual({ score: 0, source: "none" });
  });

  it("prefers place-type over a weaker keyword hit", () => {
    const verdict = matchPlaceToRequirement({
      requirementType: "bar",
      placeName: "Bar Bancone",
      placeAddress: null,
      placeTypes: ["bar"],
    });
    expect(verdict.source).toBe("placeType");
  });
});

describe("buildAffinities", () => {
  const requirements: RequirementForMatch[] = [
    {
      id: "r1",
      name: "Ristorante - Forno",
      locationType: "ristorante",
      sceneCount: 3,
    },
    { id: "r2", name: "Bancone", locationType: "bar", sceneCount: 1 },
    { id: "r3", name: "Spiaggia", locationType: "spiaggia", sceneCount: 2 },
  ];

  it("ranks matching requirements by score, drops non-matches", () => {
    const places: PlaceForMatch[] = [
      {
        placeKey: "p1",
        name: "Osteria da Gino",
        address: "Via Roma",
        placeTypes: ["restaurant"],
      },
    ];
    const [affinity] = buildAffinities(requirements, places);
    expect(affinity.placeKey).toBe("p1");
    expect(affinity.matches.map((m) => m.requirementId)).toEqual(["r1"]);
    expect(affinity.matches[0].verdict.source).toBe("placeType");
  });

  it("returns an empty match list for an unrelated place", () => {
    const places: PlaceForMatch[] = [
      {
        placeKey: "p2",
        name: "Distributore Benzina",
        address: null,
        placeTypes: ["gas_station"],
      },
    ];
    const [affinity] = buildAffinities(requirements, places);
    expect(affinity.matches).toEqual([]);
  });

  it("matches one place to multiple requirements when types overlap", () => {
    const places: PlaceForMatch[] = [
      {
        placeKey: "p3",
        name: "Locale tuttofare",
        address: null,
        placeTypes: ["restaurant", "bar"],
      },
    ];
    const [affinity] = buildAffinities(requirements, places);
    const ids = affinity.matches.map((m) => m.requirementId).sort();
    expect(ids).toEqual(["r1", "r2"]);
  });
});
