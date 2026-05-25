/**
 * Nominatim boundary fetcher.
 *
 * Retrieves the GeoJSON polygon for an OSM administrative element so we can
 * draw it on the map and run a point-in-polygon hit-test against candidates.
 */

const NOMINATIM_DETAILS_BASE = "https://nominatim.openstreetmap.org/details";

/**
 * Fetch the GeoJSON polygon for an OSM element from Nominatim.
 * Returns null if Nominatim does not have polygon data for the element.
 */
export const fetchOsmBoundary = async (
  osmId: number,
  osmType: "N" | "W" | "R",
): Promise<GeoJSON.Geometry | null> => {
  const url = new URL(NOMINATIM_DETAILS_BASE);
  url.searchParams.set("osmid", String(osmId));
  url.searchParams.set("osmtype", osmType);
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("hierarchy", "0");
  url.searchParams.set("group_hierarchy", "1");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "OhWriters/1.0" },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { geometry?: GeoJSON.Geometry };
  return data.geometry ?? null;
};

/**
 * Nominatim autocomplete suggestion for the map search overlay.
 * Carries the OSM identifiers needed to fetch a boundary polygon.
 */
export interface NominatimSuggestion {
  placeId: string;
  osmId: number;
  osmType: "N" | "W" | "R";
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  /** True when the result represents an administrative area (commune, city, region…). */
  isAdministrative: boolean;
}

const ADMINISTRATIVE_TYPES = new Set([
  "administrative",
  "boundary",
  "city",
  "town",
  "village",
  "municipality",
  "suburb",
  "county",
  "state",
  "region",
  "province",
]);

const OSM_TYPE_MAP: Record<string, "N" | "W" | "R"> = {
  node: "N",
  way: "W",
  relation: "R",
};

interface NominatimRawResult {
  place_id?: number;
  osm_id?: number;
  osm_type?: string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  class?: string;
  addresstype?: string;
}

/**
 * Fetch autocomplete suggestions from Nominatim for a given query.
 * Uses the `/search` endpoint with `format=jsonv2&addressdetails=1`.
 */
export const searchNominatim = async (
  query: string,
  signal?: AbortSignal,
): Promise<NominatimSuggestion[]> => {
  if (query.trim().length < 2) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("dedupe", "1");

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "OhWriters/1.0" },
    signal,
  });

  if (!response.ok) return [];

  const results = (await response.json()) as NominatimRawResult[];

  return results
    .filter(
      (r): r is NominatimRawResult & { osm_id: number } =>
        typeof r.osm_id === "number",
    )
    .map((r) => {
      const rawOsmType = r.osm_type ?? "node";
      const osmType: "N" | "W" | "R" = OSM_TYPE_MAP[rawOsmType] ?? "N";
      const type = r.type ?? r.class ?? r.addresstype ?? "";
      const isAdministrative = ADMINISTRATIVE_TYPES.has(type);
      const name =
        r.display_name?.split(",")[0]?.trim() ?? r.display_name ?? "";
      return {
        placeId: String(r.place_id ?? r.osm_id),
        osmId: r.osm_id,
        osmType,
        name,
        displayName: r.display_name ?? name,
        lat: parseFloat(r.lat ?? "0"),
        lng: parseFloat(r.lon ?? "0"),
        isAdministrative,
      };
    });
};
