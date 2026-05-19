import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import {
  executeSearchPlaces,
  type PlacePhoto,
  type PlaceResult,
} from "~/features/predictions/cesare-tools";

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
