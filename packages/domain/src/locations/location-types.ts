/**
 * Controlled vocabulary of normalised location types (spec 37).
 *
 * A `LocationRequirement.name` extracted from the breakdown is a set name
 * ("Bancone", "Angolo Open Grezzo"), not a category. Step 1 of the matching
 * pipeline normalises each requirement to one of these canonical types — via
 * the keyword dictionary when possible, via Haiku otherwise — so the pure
 * Step 2 match can run against a stable vocabulary.
 */

export const LOCATION_TYPES = [
  "ristorante",
  "bar",
  "appartamento",
  "casa",
  "strada",
  "piazza",
  "spiaggia",
  "ufficio",
  "negozio",
  "esterno_natura",
  "interno_generico",
  "altro",
] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

/** How a requirement's location type was resolved. */
export const LOCATION_TYPE_SOURCES = ["dictionary", "haiku"] as const;
export type LocationTypeSource = (typeof LOCATION_TYPE_SOURCES)[number];
