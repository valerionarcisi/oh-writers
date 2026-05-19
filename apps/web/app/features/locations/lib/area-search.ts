/**
 * Pure helpers for the area-search flow on the locations map.
 *
 * Extracted from `LocationMap` and `AreaSearchPanel` so the parsing of
 * Leaflet `drawcreated` events and the transformation of Google Places
 * responses can be unit-tested without a browser.
 */

import type { PlaceSuggestion } from "../server/places-autocomplete.server";

const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 50_000;

export interface DrawnCircle {
  readonly lat: number;
  readonly lng: number;
  readonly radius_m: number;
}

interface MaybeLatLng {
  lat?: number;
  lng?: number;
  getLatLng?: () => { lat: number; lng: number };
  getRadius?: () => number;
}

interface DrawCreatedLikeEvent {
  layerType?: string;
  layer?: MaybeLatLng;
}

/**
 * Parses a Leaflet `drawcreated` event into a normalized {lat, lng, radius_m}
 * shape. Returns null when the drawn shape is not a circle or the values are
 * out of the acceptable API range.
 */
export const parseDrawnCircle = (
  event: DrawCreatedLikeEvent | null | undefined,
): DrawnCircle | null => {
  if (!event || event.layerType !== "circle" || !event.layer) return null;

  const center = event.layer.getLatLng?.();
  const radius = event.layer.getRadius?.();

  if (
    !center ||
    typeof center.lat !== "number" ||
    typeof center.lng !== "number"
  ) {
    return null;
  }
  if (typeof radius !== "number" || !Number.isFinite(radius)) return null;

  const clamped = Math.max(MIN_RADIUS_M, Math.min(MAX_RADIUS_M, radius));
  return { lat: center.lat, lng: center.lng, radius_m: clamped };
};

interface NearbyPlaceRaw {
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  id?: string;
  types?: string[];
  photos?: Array<{ name?: string; widthPx?: number; heightPx?: number }>;
}

const PHOTO_THUMB_PX = 64;

const toPhotoUrl = (name: string, apiKey: string | undefined): string | null =>
  apiKey && name.startsWith("places/")
    ? `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${PHOTO_THUMB_PX}&key=${apiKey}`
    : null;

/**
 * Transforms a single Google Places `searchNearby` row into the
 * `PlaceSuggestion` shape used by the UI. Missing fields are coerced to safe
 * defaults; callers can post-filter on `placeId.length > 0`.
 */
export const toNearbySuggestion = (
  raw: NearbyPlaceRaw,
  apiKey: string | undefined,
): PlaceSuggestion => ({
  placeId: raw.id ?? "",
  name: raw.displayName?.text ?? "Luogo sconosciuto",
  address: raw.formattedAddress ?? "",
  lat: raw.location?.latitude ?? 0,
  lng: raw.location?.longitude ?? 0,
  types: raw.types ?? [],
  photos: (raw.photos ?? [])
    .filter((p): p is { name: string } => typeof p.name === "string")
    .slice(0, 3)
    .map((p) => ({
      name: p.name,
      widthPx: 0,
      heightPx: 0,
      thumbnailUrl: toPhotoUrl(p.name, apiKey),
    })),
});

export const NEARBY_RADIUS_LIMITS = {
  min: MIN_RADIUS_M,
  max: MAX_RADIUS_M,
} as const;
