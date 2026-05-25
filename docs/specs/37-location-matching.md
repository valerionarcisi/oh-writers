# Spec 37 — Location Matching & Area Discovery

> **Status:** draft — awaiting approval
> **Owner:** locations feature
> **Depends on:** boundary search (`lib/boundary.ts`), area-search (`lib/area-search.ts`, `server/places-autocomplete.server.ts`), breakdown → requirement sync (`syncRequirementsFromBreakdown`)

---

## 1. Problem

When a writer-director opens the **Location** page of a project, they want the same mental model as a real-estate map (immobiliare.it): **pick an area, see every relevant pin, and know which scene each pin could serve.**

Today the page can:

- search a comune/provincia boundary (spec from the previous session, just fixed for province-capital ambiguity)
- hit-test existing candidates against a drawn area
- show a "N candidati in: {label}" banner

What's missing is the **matching intelligence** and the **discovery of new places**:

1. The map shows candidates, but does not say _which scene/requirement_ each pin fits beyond its single owning requirement.
2. There is no way to discover real-world places in the selected area that are not yet saved as candidates.
3. There are no per-scene chips ("qui ci puoi girare la Scena 1, qui la Scena 2").

---

## 2. Goal

Selecting an area (comune boundary or drawn shape) produces a **two-layer pin map**:

- **Filled pins** — candidates already saved in the project that fall inside the area.
- **Hollow pins** — real places discovered via Google Places inside the area, not yet candidates.

Every pin carries **scene-affinity chips**: the list of location requirements (and therefore scenes) the place is compatible with, ranked by match strength. Clicking a chip selects that requirement; clicking "Aggiungi" on a hollow pin persists it as a candidate under the chosen requirement.

```
Cerco "Fermo"
 → boundary del comune disegnato
 → pin pieni = candidati salvati dentro Fermo
 → pin vuoti = ristoranti/bar/piazze reali (Google Places) dentro Fermo
 → ogni pin: chip "→ Scena 12 (RISTORANTE)", "→ Scena 7 (BAR)"
 → click chip = seleziona requirement; click "Aggiungi" su pin vuoto = nuovo candidato
```

### Non-goals

- No automatic confirmation of candidates — discovery only _suggests_, the user decides.
- No new map engine — stays on Leaflet.
- No Overpass/OSM — Google Places (`searchPlacesInArea`) already returns `types[]`; reuse it. (Overpass was considered and rejected to avoid a second geo provider; revisit only if Places coverage proves insufficient in rural provinces.)
- No persistence of discovered places we did not add — discovery results are ephemeral per session, only an explicit "Aggiungi" writes a candidate.

---

## 3. Data model

The **resolved location type** (Step 1) is persisted so normalisation runs once
per requirement, not per area selection. The **Step 2 match** is computed, never
stored — it is a pure function of the resolved type + the place.

### Existing (unchanged)

- `location_requirements` — `name` (often a set name, e.g. `"Bancone"`), `description`, `intExt`, `timeOfDay[]`, owns N scenes via `location_requirement_scenes`.
- `location_candidates` — belongs to ONE requirement (`requirementId` notNull), has `lat`/`lng`, `name`, `address`.
- `PlaceSuggestion` (from `places-autocomplete.server.ts`) — `{ name, address, lat, lng, photos[], types[] }`. `types[]` carries Google place categories (`restaurant`, `bar`, `cafe`, `park`…).

### New — `location_requirements` columns (Phase 1)

Store the resolved type + how it was resolved. Migration adds two nullable columns
so it is backward-compatible (null = not yet normalised):

```sql
-- migration NNNN_location_requirement_type.sql (Phase 1)
alter table location_requirements
  add column location_type text,                 -- LocationType vocabulary, null until resolved
  add column location_type_source text;          -- 'dictionary' | 'haiku' | null
```

No separate cache table: the type lives on the requirement itself, resolved once
(dictionary on sync, Haiku in batch for the rest). Re-normalisation is triggered
only when the requirement's `name`/`description` changes.

Step 2 match verdicts are **not** persisted — they are recomputed cheaply on every
area selection from the resolved type and the in-area places.

---

## 4. Why this is LLM-first, not dictionary-first

**Decision driven by the real data, not assumption.** Inspecting the seed DB,
the requirement `name` values that the breakdown actually produces are mostly
**set names, not location categories**:

```
Appartamento Marta          → "appartamento" is a clean type, "Marta" is noise
Strada del paese            → "strada" weak
Fuori Dalla Porta           → no category at all
Angolo Open Grezzo          → set name, not a place type
Bancone                     → set name (the counter of a bar/restaurant)
Sala                        → ambiguous (dining room? theatre? living room?)
Cucina                      → interior of a house OR a restaurant kitchen
Ristorante - Forno          → "ristorante" clean
Montage Di Filippo Che...   → not even a physical location
```

Only **~2 of 9** map cleanly through a keyword dictionary. The breakdown extracts
names as the writer wrote them, so a dictionary alone shows chips on a minority of
requirements. The missing link is the step that turns a **set name → real-world
location type** — exactly what an LLM does well and a dictionary cannot.

So matching is a **two-step pipeline**:

```
Step 1 — NORMALISE  requirement → locationType  (dictionary free path, Haiku for the rest)
Step 2 — MATCH      locationType ↔ place        (pure, deterministic, no LLM)
```

Step 2 is the cheap pure function. Step 1 is where Haiku earns its keep — once.

### 4.1 Step 1: requirement normalisation

A requirement is normalised to a canonical `LocationType` (a controlled
vocabulary, not free text) **once**, then cached. Two sources:

- **Dictionary (free, instant):** if the requirement `name` contains a known
  keyword stem, assign the type directly. Covers the clean cases (`Ristorante - Forno`,
  `Appartamento Marta`) at zero cost.
- **Haiku (batch, ~$0.001/project):** every requirement the dictionary misses
  is sent in **one batch call** with `{ name, description, linked scene headings }`
  → structured output `requirementId → { locationType, confidence }`. Haiku reads
  "Bancone" + the scene set at a bar and returns `bar`.

The result is persisted in `location_requirement_type` (see §3) so it is computed
once per requirement, not per area selection or per render.

```typescript
// packages/domain/src/locations/location-types.ts
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
```

### 4.2 The dictionary (Step 1 free path + Step 2 place mapping)

The dictionary now maps a **canonical `LocationType`** to (a) IT keyword stems used
to recognise it in a requirement name, and (b) Google Places `types` used to match
discovered places. It is **data, not code** — extending it never touches logic.

```typescript
// packages/domain/src/locations/match.ts
export interface LocationCategory {
  readonly keywords: readonly string[]; // IT stems, lowercased, accent-stripped
  readonly placeTypes: readonly string[]; // Google Places type ids
}

export const LOCATION_CATEGORIES: Readonly<
  Record<LocationType, LocationCategory>
> = {
  ristorante: {
    keywords: ["ristorante", "trattoria", "osteria", "locanda", "forno"],
    placeTypes: ["restaurant", "meal_takeaway"],
  },
  bar: { keywords: ["bar", "caffe", "bancone"], placeTypes: ["bar", "cafe"] },
  appartamento: {
    keywords: ["appartamento", "monolocale"],
    placeTypes: ["lodging"],
  },
  // … the full controlled vocabulary; sorted, inline comments only where non-obvious
};
```

### 4.3 Step 2: the match function (pure, deterministic, no LLM)

Given a requirement's resolved `LocationType` and a place, score the fit. This is
the cheap pure function the user asked about — it runs on every area selection,
needs no LLM, scales to feature length trivially.

```typescript
export interface MatchInput {
  readonly requirementType: LocationType; // resolved in Step 1
  readonly placeName: string;
  readonly placeAddress: string | null;
  readonly placeTypes: readonly string[]; // empty for saved candidates
}

export interface MatchVerdict {
  readonly score: number; // 0..1
  readonly source: "placeType" | "keyword" | "none";
}

export const matchPlaceToRequirement = (input: MatchInput): MatchVerdict => {
  // 1. placeType: requirement type's placeTypes intersect place.types → 0.9
  // 2. keyword: a category keyword appears in place name/address → 0.7
  // 3. none → 0
};
```

Pure, deterministic, ≥ 5 Vitest cases (placeType hit, keyword hit, no match,
accent-insensitive, empty placeTypes for saved candidate).

### 4.4 Affinity builder (pure)

Given the area's requirements (each with a resolved `LocationType`) + the
candidates/places inside it, produce the per-pin chip data:

```typescript
export interface PinAffinity {
  readonly placeKey: string;
  readonly matches: ReadonlyArray<{
    readonly requirementId: string;
    readonly requirementName: string;
    readonly sceneCount: number;
    readonly verdict: MatchVerdict;
  }>; // sorted desc by score, score > 0 only
}

export const buildAffinities = (
  requirements: readonly RequirementForMatch[], // include resolved locationType
  places: readonly PlaceForMatch[],
): readonly PinAffinity[];
```

---

## 5. Phases

### Phase 1 — Requirement normalisation + match on existing candidates

**Scope:** the full two-step pipeline + chips on existing candidate pins and in
the panel. This is where the LLM-first decision lands — without normalisation the
chips would appear on only ~2 of 9 real requirements.

- Migration `NNNN_location_requirement_type.sql` — add `location_type`, `location_type_source`.
- `packages/domain/src/locations/location-types.ts` — `LOCATION_TYPES` vocabulary.
- `packages/domain/src/locations/match.ts` — dictionary + `matchPlaceToRequirement` + `buildAffinities`, fully unit-tested (pure, no LLM).
- `features/locations/server/normalise.server.ts`:
  - `resolveByDictionary(name)` — free path, returns `LocationType | null`.
  - `normaliseRequirements(db, projectId)` — dictionary first; everything unresolved goes to **one batch Haiku call** with `{ name, description, linked scene headings }` → structured output `requirementId → { locationType, confidence }`; persist `location_type` + `location_type_source`.
  - Triggered on `syncRequirementsFromBreakdown` and when a requirement name/description changes.
- `MOCK_AI=true` → fixtures in `_mocks/normalise.fixtures.ts` (e.g. `Bancone → bar`, `Angolo Open Grezzo → ristorante`), no Anthropic calls.
- `LocationMap` — when an area is active, compute affinities (pure Step 2) for the candidates inside it; render scene-affinity chips on the selected pin's popup and outline matching pins.
- `LocationPanel` — when a requirement is selected, candidates from _other_ requirements whose resolved type matches show a "compatibile" chip.
- Accent-insensitive, case-insensitive.

**Test:** OHW-370 (match engine, Vitest ≥ 5 cases), OHW-371 (E2E: select area → chips on candidate pins), OHW-375 (normalise mock: `Bancone → bar` via fixture, dictionary path for `Ristorante - Forno`). Cost smoke `cost:smoke:location-normalise` (real Haiku batch, not in CI).

### Phase 2 — Discovery of new places (Google Places, reuse `searchPlacesInArea`)

**Scope:** the immobiliare.it layer — hollow pins for real places not yet saved.

- Extend `searchPlacesInArea` (or add `discoverPlacesInBoundary`) to accept a boundary GeoJSON / bbox instead of only a circle, and to query Places for the **union of placeTypes** derived from the project's resolved requirement types (so we only fetch relevant categories, not every POI).
- `LocationMap` — render discovered places as hollow pins, deduped against existing candidates by proximity (< ~40 m + name similarity).
- Each hollow pin shows affinity chips (same Step 2 engine) + an "Aggiungi come candidato" action that calls `addLocationCandidate` under the best-matching requirement (user can change the requirement in a small select).
- Discovery results are **ephemeral** — kept in `LocationsPage` state, never persisted unless added.
- Respect Google Places ToS: do not store Places data beyond the explicitly-added candidate; cache the in-session response only.

**Test:** OHW-372 (E2E with mocked Places: select area → hollow pins appear, "Aggiungi" persists a candidate under the right requirement). MOCK path reuses the existing `searchPlacesInArea` mock fixtures.

### Phase 3 — Pin clustering for feature-length projects

**Scope:** keep the map readable when discovery returns hundreds of pins (see §9).

- `Leaflet.markercluster` for hollow + filled pins above a density threshold.
- Limit Places category fan-out to the project's resolved types (already in Phase 2) and cluster the rest.

**Test:** OHW-374 (E2E: dense area renders clusters, expanding a cluster shows pins). Not Cesare-related; no cost smoke.

**Test:** OHW-373 (Vitest classify mock), OHW-374 (E2E mock-ui), cost smoke (not in CI).

---

## 6. Cesare integration

When the area banner shows "Nessun candidato in: {label}" (or few), the existing "✦ Chiedi a Cesare" CTA already opens Cesare with the location context. Phase 2 enriches the Cesare scouting tool so it can call `discoverPlacesInBoundary` itself and propose candidates inline — but that wiring is a **follow-up**, tracked separately, not in this spec's phases.

---

## 7. UI notes

- Filled vs hollow pins: filled = saved candidate (current orange `#f97316` for matching, dimmed for non-matching). Hollow = discovered (white fill, accent stroke). Use existing `--color-*` tokens, never hardcode (CLAUDE.md CSS rule); the `#f97316` already in `LocationMap` predates this spec and is tracked for tokenisation separately.
- Chips: reuse the chip primitive from `@oh-writers/ui` if one exists; otherwise a small CSS-module chip, camelCase classes, `--radius-md`.
- Affinity chips are ranked; show top 3, "+N" overflow.
- All chip/pin interactions keyboard-accessible via `react-aria` (CLAUDE.md hard rule).

---

## 8. Tests summary

| Tag     | Level      | What                                                               |
| ------- | ---------- | ------------------------------------------------------------------ |
| OHW-370 | Vitest     | `matchPlaceToRequirement` + `buildAffinities` (Step 2) — ≥ 5 cases |
| OHW-371 | Playwright | Select area → affinity chips on existing candidate pins            |
| OHW-375 | Vitest     | Normalisation: dictionary path + Haiku mock (`Bancone → bar`)      |
| OHW-372 | Playwright | Discovery (mocked Places) → hollow pins + "Aggiungi"               |
| OHW-374 | Playwright | Phase 3 dense area → pin clustering                                |
| —       | Cost smoke | `cost:smoke:location-normalise` (real Haiku batch, not in CI)      |

Plus vernissage walk + report (`vernissage/location-matching.md`).

---

## 9. Scale: short film today, feature film tomorrow

The current target project is a short (10–30 scenes). The architecture must not
break when a project is a feature (80–150 scenes, 30–60 requirements, hundreds
of discovered pins per urban area). What each layer does under that load:

| Layer                       | Short                     | Feature                                                                                   | Action                                                                                                                                          |
| --------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Matching engine**         | trivial                   | O(reqs × places) string ops — 60 × 300 ≈ 18k, still instant                               | none; scales as-is                                                                                                                              |
| **Per-pin chips**           | fine                      | fine                                                                                      | none                                                                                                                                            |
| **Map rendering**           | fine                      | hundreds of pins = unreadable                                                             | **clustering** (Leaflet.markercluster) + limit Places fan-out to the project's actual requirement categories — added in Phase 2                 |
| **Cesare global awareness** | RAG lazy window is enough | window of ±2 scenes is a drop in 150 — Cesare can't reason about arc/tone across the film | **pgvector** (already spec 32 Phase 2, independent of this spec). Until then, `synopsis`/`treatment` in the prompt carry the whole-film summary |

**Key point:** the matching engine and discovery scale to feature length with
**no rewrite**. The feature-length triggers are (a) pin clustering — a Phase 2 UI
detail, and (b) pgvector for global narrative awareness — owned by spec 32 Fase 2,
not blocked on this spec. Matching is structured data, not RAG; it never needs
the scene corpus.

### Whole-film geographic awareness (follow-up, not in these phases)

A deterministic **project geography summary** — "3 recurring locations + 8 one-off,
mostly provincial interiors" — aggregated from the requirements would make Cesare
sharper on scouting without any LLM cost. It is an aggregation of structured data,
not RAG. Tracked as a follow-up, intentionally out of scope here.

---

## 10. Open questions

1. **Dedup threshold** for hollow vs filled pins — start at 40 m + Jaro-Winkler name similarity > 0.85; tune after first real run.
2. **Places category fan-out cost** — querying many categories per area multiplies Places calls. Mitigate by batching the placeType union into as few Nearby requests as the API allows, and caching per-area in session.
3. **Dictionary coverage** — ship with ~15 common IT location types; log requirement names that hit no category so we extend the table from real usage rather than guessing.
