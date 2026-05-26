/**
 * Location matching engine — pure, framework-agnostic (spec 37, Step 2).
 *
 * Step 1 (normalisation) resolves each requirement to a `LocationType`. This
 * module is Step 2: given a resolved type and a place (a saved candidate or a
 * discovered Google Places result), score how well the place fits the type.
 * Deterministic, no LLM, no I/O — runs on every area selection.
 */

import { LOCATION_TYPES, type LocationType } from "./location-types.js";

/**
 * Maps a canonical `LocationType` to the signals used to recognise it:
 * - `keywords`: Italian stems matched against a requirement name (Step 1 free
 *   path) and against a place name/address (Step 2 fallback).
 * - `matchTypes`: arbitrary strings compared against a place's `types` for the
 *   Step-2 MATCH (intersection only — any value is fine).
 * - `searchTypes`: **valid** Google `searchNearby` `includedTypes` used to
 *   DISCOVER places of this category. Empty = not searchable by type (e.g. a
 *   street or a generic interior). Validated against the live Places API
 *   (2026-05-26) — invalid types like `route`/`town_square` are excluded so the
 *   query never 400s.
 *
 * This is data, not logic — extend it without touching the functions below.
 */
export interface LocationCategory {
  readonly keywords: readonly string[];
  readonly matchTypes: readonly string[];
  readonly searchTypes: readonly string[];
}

export const LOCATION_CATEGORIES: Readonly<
  Record<LocationType, LocationCategory>
> = {
  ristorante: {
    keywords: ["ristorante", "trattoria", "osteria", "locanda", "forno"],
    matchTypes: ["restaurant", "meal_takeaway", "meal_delivery", "bakery"],
    searchTypes: ["restaurant", "meal_takeaway", "bakery"],
  },
  bar: {
    keywords: ["bar", "caffe", "caffetteria", "bancone", "pub", "birreria"],
    matchTypes: ["bar", "cafe", "night_club", "pub"],
    searchTypes: ["bar", "pub", "night_club", "cafe"],
  },
  appartamento: {
    keywords: ["appartamento", "monolocale", "bilocale", "attico"],
    matchTypes: ["lodging"],
    searchTypes: ["lodging"],
  },
  casa: {
    keywords: ["casa", "villa", "abitazione", "cascina", "casolare"],
    matchTypes: ["lodging"],
    searchTypes: ["lodging"],
  },
  strada: {
    keywords: ["strada", "via", "viale", "corso", "vicolo", "incrocio"],
    matchTypes: ["route"],
    // Streets/exteriors aren't a searchable POI type — discovery skips them.
    searchTypes: [],
  },
  piazza: {
    keywords: ["piazza", "largo", "piazzale"],
    matchTypes: ["town_square", "plaza"],
    // `town_square` is not a valid searchNearby type — skip type-discovery.
    searchTypes: [],
  },
  spiaggia: {
    keywords: ["spiaggia", "lido", "stabilimento", "litorale", "molo"],
    matchTypes: ["beach", "natural_feature"],
    searchTypes: ["beach"],
  },
  ufficio: {
    keywords: ["ufficio", "studio", "agenzia", "redazione"],
    matchTypes: [
      "accounting",
      "lawyer",
      "real_estate_agency",
      "corporate_office",
    ],
    searchTypes: ["corporate_office"],
  },
  negozio: {
    keywords: ["negozio", "bottega", "boutique", "mercato", "supermercato"],
    matchTypes: ["store", "supermarket", "shopping_mall", "clothing_store"],
    searchTypes: ["store", "supermarket", "shopping_mall", "clothing_store"],
  },
  esterno_natura: {
    keywords: ["bosco", "campagna", "montagna", "lago", "fiume", "campo"],
    matchTypes: ["park", "natural_feature", "campground"],
    searchTypes: ["park", "campground", "hiking_area"],
  },
  interno_generico: {
    // No dictionary keywords: generic interiors ("Sala", "Cucina", "Stanza")
    // are ambiguous out of context (a restaurant's vs a home's) — they always
    // go to Haiku, which sees the linked scene headings. This stays a valid
    // Haiku output type, just never a dictionary shortcut.
    keywords: [],
    matchTypes: [],
    searchTypes: [],
  },
  altro: {
    keywords: [],
    matchTypes: [],
    searchTypes: [],
  },
};

/** Valid Google searchNearby types for a category. Empty = not searchable by type. */
export const searchTypesForType = (type: LocationType): readonly string[] =>
  LOCATION_CATEGORIES[type].searchTypes;

/** Score weights, ordered by signal strength. */
const SCORE_PLACE_TYPE = 0.9;
const SCORE_KEYWORD = 0.7;

/** Lowercase and strip diacritics so "caffè" matches "caffe". */
const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Whole-word keyword match: tokenise on non-letters and compare folded tokens.
 * Word-level (not substring) so "pub" does not match "pubblico" and "via" does
 * not match "ovviamente".
 */
const containsKeyword = (
  haystack: string,
  keywords: readonly string[],
): boolean => {
  if (keywords.length === 0) return false;
  const tokens = new Set(
    fold(haystack)
      .split(/[^a-z]+/)
      .filter(Boolean),
  );
  return keywords.some((kw) => tokens.has(kw));
};

/**
 * Step 1 free path: resolve a requirement name to a `LocationType` by keyword,
 * or `null` when no keyword matches (the caller then falls back to Haiku).
 * Earlier vocabulary entries win on ties — `LOCATION_TYPES` order is the priority.
 */
export const resolveTypeByKeyword = (
  requirementName: string,
): LocationType | null => {
  for (const type of LOCATION_TYPES) {
    if (containsKeyword(requirementName, LOCATION_CATEGORIES[type].keywords)) {
      return type;
    }
  }
  return null;
};

export interface MatchInput {
  /** Requirement's resolved location type (Step 1 output). */
  readonly requirementType: LocationType;
  readonly placeName: string;
  readonly placeAddress: string | null;
  /** Google Places `types`; empty for saved candidates. */
  readonly placeTypes: readonly string[];
}

export interface MatchVerdict {
  readonly score: number;
  readonly source: "placeType" | "keyword" | "none";
}

const NO_MATCH: MatchVerdict = { score: 0, source: "none" };

/**
 * Score how well a place fits a requirement's resolved type.
 * Place-type intersection is the strongest signal; a keyword in the place
 * name/address is the fallback for saved candidates that carry no Google types.
 */
export const matchPlaceToRequirement = (input: MatchInput): MatchVerdict => {
  const category = LOCATION_CATEGORIES[input.requirementType];

  if (
    input.placeTypes.length > 0 &&
    input.placeTypes.some((t) => category.matchTypes.includes(t))
  ) {
    return { score: SCORE_PLACE_TYPE, source: "placeType" };
  }

  const text = `${input.placeName} ${input.placeAddress ?? ""}`;
  if (containsKeyword(text, category.keywords)) {
    return { score: SCORE_KEYWORD, source: "keyword" };
  }

  return NO_MATCH;
};

/** A requirement reduced to what the affinity builder needs. */
export interface RequirementForMatch {
  readonly id: string;
  readonly name: string;
  readonly locationType: LocationType;
  readonly sceneCount: number;
}

/** A place (saved candidate or discovered) reduced to what the builder needs. */
export interface PlaceForMatch {
  readonly placeKey: string;
  readonly name: string;
  readonly address: string | null;
  readonly placeTypes: readonly string[];
}

export interface RequirementMatch {
  readonly requirementId: string;
  readonly requirementName: string;
  readonly sceneCount: number;
  readonly verdict: MatchVerdict;
}

export interface PinAffinity {
  readonly placeKey: string;
  /** Matching requirements, sorted by score desc; only score > 0 included. */
  readonly matches: readonly RequirementMatch[];
}

/**
 * For each place, the requirements it could serve, ranked by match strength.
 * Pure: same inputs always yield the same affinities.
 */
export const buildAffinities = (
  requirements: readonly RequirementForMatch[],
  places: readonly PlaceForMatch[],
): readonly PinAffinity[] =>
  places.map((place) => {
    const matches = requirements
      .map(
        (req): RequirementMatch => ({
          requirementId: req.id,
          requirementName: req.name,
          sceneCount: req.sceneCount,
          verdict: matchPlaceToRequirement({
            requirementType: req.locationType,
            placeName: place.name,
            placeAddress: place.address,
            placeTypes: place.placeTypes,
          }),
        }),
      )
      .filter((m) => m.verdict.score > 0)
      .sort((a, b) => b.verdict.score - a.verdict.score);

    return { placeKey: place.placeKey, matches };
  });
