import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import {
  executeSearchPlaces,
  type PlacePhoto,
  type PlaceResult,
} from "~/features/predictions/cesare-tools";
import { toNearbySuggestion } from "../lib/area-search";

const MAX_RESULTS = 8;
const THUMBNAIL_WIDTH_PX = 64;

export interface PlacePhotoWithThumb extends PlacePhoto {
  // SECURITY TODO: thumbnailUrl embeds the GOOGLE_PLACES_API_KEY inline; long-term fix
  // is a server-side proxy endpoint (e.g. /api/places-photo?name=...). Same exposure
  // pattern as cesare-tools.ts:buildPlacePhotoUrl.
  thumbnailUrl: string | null;
}

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  photos: PlacePhotoWithThumb[];
  types: string[];
}

export interface PlacesAutocompleteError {
  _tag: string;
  message: string;
}

const buildThumbnailUrl = (
  photoName: string,
  apiKey: string | undefined,
): string | null => {
  if (!apiKey || !photoName.startsWith("places/")) return null;
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${THUMBNAIL_WIDTH_PX}&key=${apiKey}`;
};

const toSuggestion = (
  place: PlaceResult,
  apiKey: string | undefined,
): PlaceSuggestion => ({
  placeId: place.placeId,
  name: place.name,
  address: place.address,
  lat: place.lat,
  lng: place.lng,
  photos: place.photos.map((photo) => ({
    ...photo,
    thumbnailUrl: buildThumbnailUrl(photo.name, apiKey),
  })),
  types: place.types,
});

const PlacesAutocompleteInputSchema = z.object({
  query: z.string().min(2).max(120),
  locationBias: z.string().max(120).optional(),
  maxResults: z.number().int().min(1).max(MAX_RESULTS).optional(),
});

export const searchPlacesAutocomplete = createServerFn({ method: "POST" })
  .validator(PlacesAutocompleteInputSchema)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<PlaceSuggestion[], PlacesAutocompleteError>> => {
      await requireUser();

      const apiKey = process.env["GOOGLE_PLACES_API_KEY"];

      const result = await executeSearchPlaces({
        query: data.query,
        location_bias: data.locationBias,
        max_results: Math.min(data.maxResults ?? MAX_RESULTS, MAX_RESULTS),
      }).map((places) => places.map((place) => toSuggestion(place, apiKey)));

      return toShape(result);
    },
  );

// ─── Nearby search (TripAdvisor-style, draw-a-circle flow) ─────────────────

const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 50_000;
const DEFAULT_NEARBY_RESULTS = 12;
const MAX_NEARBY_RESULTS = 20;

const SearchPlacesInAreaInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().min(MIN_RADIUS_M).max(MAX_RADIUS_M),
  query: z.string().max(120).optional(),
  max_results: z.number().int().min(1).max(MAX_NEARBY_RESULTS).optional(),
});

interface NearbyResponse {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    id?: string;
    types?: string[];
    photos?: Array<{ name?: string; widthPx?: number; heightPx?: number }>;
  }>;
}

const FIELD_MASK =
  "places.displayName,places.formattedAddress,places.location,places.id,places.types,places.photos";

const callNearbySearch = (
  apiKey: string,
  body: Record<string, unknown>,
): ResultAsync<NearbyResponse, PlacesAutocompleteError> =>
  ResultAsync.fromPromise(
    (async () => {
      const response = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": FIELD_MASK,
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Google Places searchNearby ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as NearbyResponse;
    })(),
    (e) => ({
      _tag: "PlacesNearbyError",
      message: e instanceof Error ? e.message : String(e),
    }),
  );

/**
 * Falls back to searchText (with a coordinate hint in the query) when the user
 * passed a free-text query. Google Places `searchNearby` does not accept a
 * `textQuery`, so for text-biased searches we use the existing `searchText`
 * endpoint, then keep only results whose distance is plausibly inside the
 * radius. For purely "what's around here" calls (no query), we hit
 * `searchNearby` and let it return whatever sits inside the circle.
 */
// Deterministic suggestions used when MOCK_AI=true. Mirrors the shape returned
// by Google Places searchNearby so the UI can be exercised end-to-end without
// an upstream API key. Place IDs are stable so Playwright can target rows via
// `area-search-add-<placeId>` testids.
const buildMockNearbySuggestions = (
  lat: number,
  lng: number,
): PlaceSuggestion[] => [
  {
    placeId: "place_mock_1",
    name: "Trattoria del Cerchio",
    address: "Via del Test 1, Milano",
    lat,
    lng,
    types: ["restaurant"],
    photos: [],
  },
  {
    placeId: "place_mock_2",
    name: "Bar Centrale",
    address: "Via del Test 2, Milano",
    lat: lat + 0.001,
    lng: lng + 0.001,
    types: ["bar"],
    photos: [],
  },
];

export const searchPlacesInArea = createServerFn({ method: "POST" })
  .validator(SearchPlacesInAreaInputSchema)
  .handler(
    async ({
      data,
    }): Promise<ResultShape<PlaceSuggestion[], PlacesAutocompleteError>> => {
      await requireUser();

      if (process.env["MOCK_AI"] === "true") {
        return toShape(
          await okAsync<PlaceSuggestion[], PlacesAutocompleteError>(
            buildMockNearbySuggestions(data.lat, data.lng),
          ),
        );
      }

      const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
      if (!apiKey) {
        return toShape(
          await errAsync<PlaceSuggestion[], PlacesAutocompleteError>({
            _tag: "PlacesNearbyError",
            message:
              "GOOGLE_PLACES_API_KEY non configurata — ricerca area non disponibile",
          }),
        );
      }

      const maxResults = Math.min(
        data.max_results ?? DEFAULT_NEARBY_RESULTS,
        MAX_NEARBY_RESULTS,
      );

      // Free-text query → reuse `executeSearchPlaces` (searchText endpoint).
      if (data.query && data.query.trim().length > 0) {
        const locationBias = `vicino a ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)} (raggio ${Math.round(data.radius_m)} m)`;
        const result = await executeSearchPlaces({
          query: data.query.trim(),
          location_bias: locationBias,
          max_results: maxResults,
        }).map((places: PlaceResult[]) =>
          places.map((place) => ({
            placeId: place.placeId,
            name: place.name,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            types: place.types,
            photos: place.photos.map((photo) => ({
              ...photo,
              thumbnailUrl: buildThumbnailUrl(photo.name, apiKey),
            })),
          })),
        );
        return toShape(
          result.mapErr<PlacesAutocompleteError>((e) => ({
            _tag: "PlacesNearbyError",
            message: e.message,
          })),
        );
      }

      const result = await callNearbySearch(apiKey, {
        locationRestriction: {
          circle: {
            center: { latitude: data.lat, longitude: data.lng },
            radius: Math.round(data.radius_m),
          },
        },
        maxResultCount: maxResults,
      }).map((response) =>
        (response.places ?? [])
          .map((p) => toNearbySuggestion(p, apiKey))
          .filter((s) => s.placeId.length > 0),
      );

      return toShape(result);
    },
  );

export const placesAutocompleteQueryOptions = (
  query: string,
  locationBias?: string,
) => ({
  queryKey: ["places-autocomplete", query, locationBias ?? ""] as const,
  queryFn: () =>
    searchPlacesAutocomplete({
      data: { query, locationBias, maxResults: MAX_RESULTS },
    }),
  enabled: query.trim().length >= 2,
  staleTime: 60_000,
});
