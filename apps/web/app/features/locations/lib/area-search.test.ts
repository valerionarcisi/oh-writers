import { describe, it, expect } from "vitest";
import { parseDrawnCircle, toNearbySuggestion } from "./area-search";

describe("parseDrawnCircle", () => {
  const makeCircleLayer = (lat: number, lng: number, radius: number) => ({
    getLatLng: () => ({ lat, lng }),
    getRadius: () => radius,
  });

  it("parses a valid circle event into normalized shape", () => {
    const out = parseDrawnCircle({
      layerType: "circle",
      layer: makeCircleLayer(45.46, 9.19, 2500),
    });
    expect(out).toEqual({ lat: 45.46, lng: 9.19, radius_m: 2500 });
  });

  it("returns null for non-circle shapes", () => {
    const out = parseDrawnCircle({
      layerType: "polygon",
      layer: makeCircleLayer(0, 0, 100),
    });
    expect(out).toBeNull();
  });

  it("returns null when the event itself is missing", () => {
    expect(parseDrawnCircle(null)).toBeNull();
    expect(parseDrawnCircle(undefined)).toBeNull();
  });

  it("clamps the radius to the API min/max range", () => {
    const tooSmall = parseDrawnCircle({
      layerType: "circle",
      layer: makeCircleLayer(45, 9, 50),
    });
    expect(tooSmall?.radius_m).toBe(100);

    const tooLarge = parseDrawnCircle({
      layerType: "circle",
      layer: makeCircleLayer(45, 9, 100_000),
    });
    expect(tooLarge?.radius_m).toBe(50_000);
  });

  it("returns null when the layer is missing getLatLng or getRadius", () => {
    expect(
      parseDrawnCircle({ layerType: "circle", layer: {} as never }),
    ).toBeNull();
  });
});

describe("toNearbySuggestion", () => {
  const apiKey = "AIzaTEST";

  it("maps a complete Google place row to a PlaceSuggestion", () => {
    const out = toNearbySuggestion(
      {
        id: "ChIJ123",
        displayName: { text: "Pizzeria Da Mario" },
        formattedAddress: "Via Roma 1, Milano",
        location: { latitude: 45.4, longitude: 9.1 },
        types: ["restaurant", "food"],
        photos: [
          { name: "places/ChIJ123/photos/abc", widthPx: 0, heightPx: 0 },
        ],
      },
      apiKey,
    );

    expect(out.placeId).toBe("ChIJ123");
    expect(out.name).toBe("Pizzeria Da Mario");
    expect(out.address).toBe("Via Roma 1, Milano");
    expect(out.lat).toBe(45.4);
    expect(out.lng).toBe(9.1);
    expect(out.types).toEqual(["restaurant", "food"]);
    expect(out.photos).toHaveLength(1);
    expect(out.photos[0]?.thumbnailUrl).toContain("places/ChIJ123/photos/abc");
    expect(out.photos[0]?.thumbnailUrl).toContain("key=AIzaTEST");
  });

  it("defaults missing fields without throwing", () => {
    const out = toNearbySuggestion({}, apiKey);
    expect(out.placeId).toBe("");
    expect(out.name).toBe("Luogo sconosciuto");
    expect(out.address).toBe("");
    expect(out.photos).toEqual([]);
  });

  it("drops photo entries without a 'name' and caps at 3", () => {
    const out = toNearbySuggestion(
      {
        id: "x",
        photos: [
          { name: "places/x/photos/a" },
          { name: "places/x/photos/b" },
          { name: undefined },
          { name: "places/x/photos/c" },
          { name: "places/x/photos/d" },
        ],
      },
      apiKey,
    );
    expect(out.photos).toHaveLength(3);
    expect(out.photos.map((p) => p.name)).toEqual([
      "places/x/photos/a",
      "places/x/photos/b",
      "places/x/photos/c",
    ]);
  });

  it("returns null thumbnailUrl when the API key is missing", () => {
    const out = toNearbySuggestion(
      { id: "x", photos: [{ name: "places/x/photos/a" }] },
      undefined,
    );
    expect(out.photos[0]?.thumbnailUrl).toBeNull();
  });

  it("returns null thumbnailUrl for photo names that do not start with 'places/'", () => {
    const out = toNearbySuggestion(
      { id: "x", photos: [{ name: "weird/name" }] },
      apiKey,
    );
    expect(out.photos[0]?.thumbnailUrl).toBeNull();
  });
});
