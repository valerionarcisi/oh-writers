# Spec 37b — Scene-aware discovery, search types & photos

> **Status:** draft — awaiting approval
> **Parent:** [37 — Location Matching & Area Discovery](./37-location-matching.md)
> **Owner:** locations feature

---

## 1. Problem (from live use)

Testing Phase 2 discovery on "Non fa ridere" / Fermo surfaced five problems:

1. **Wrong suggestions.** Discovered pins were a police station, a shopping mall,
   a town square — not filming-relevant places. Root cause: the category bias
   sends `route` (for `strada`) which makes Google `searchNearby` **400**, so the
   code falls back to an **unfiltered** search returning every POI. Confirmed by
   probing the API: `route` is rejected, but `restaurant`, `bar`, `pub`,
   `night_club`, `bakery`, `lodging`… are accepted, including in groups.

2. **Suggestions don't change per scene.** Discovery loads **all** project
   requirements and matches against all of them, so selecting a different scene
   doesn't change the pins. "Fuori Dalla Porta" (type `strada`) matches almost
   anything weakly, polluting the results.

3. **No photos.** Discovered pins and affinity chips show only a blue dot / text.
   The user wants the place photo to judge fit at a glance.

4. **Can't clear the area from the map.** The banner has a ✕ but the drawn/boundary
   selection on the map itself has no dismiss affordance.

5. **"Cerca in questa area" menu bug.** The manual search popover's "Aggiungi a"
   dropdown overlaps / mislays (img 5). Its results are actually _better_ (real
   pasticcerie etc.) because the user types the category directly.

### The deeper point (user)

> "Lo scopo è scoprire se in un'area ci sono luoghi adatti per girare la scena."

A single Google type (`restaurant`) is too poor. The right query depends on the
**scene**, not just the location noun:

- _Open mic in a pub_ → `bar, pub, night_club` (a place with a stage/space), not
  just `bar`.
- _Horror in a Michelin restaurant_ → `restaurant`, but "Michelin vs trattoria"
  is **not** a Google `type` — it lives in rating, photos, name. Type gets you in
  the door; **atmosphere ranking** picks the right one.
- _"Fuori Dalla Porta"_ (an exterior/street) → not a searchable POI type at all;
  discovery by type doesn't apply.

So discovery needs **two layers**: (a) a sensible _set_ of valid Google types per
category, and (b) a relevance ranking of the returned places. Layer (b)'s smart
form (Cesare reading the scene and judging photos) is large — split into a later
phase. This spec ships (a) + deterministic ranking + the UX fixes.

---

## 2. Goal

- Discovery is **scene-aware**: it searches for the **selected requirement's**
  type, using a rich set of _valid_ Google types. Change scene → change pins.
- No more 400 → no more unfiltered garbage. Non-searchable categories (street,
  generic exterior) **skip** type-discovery and tell the user why.
- Discovered pins and candidate rows show a **photo** when available.
- The area selection can be **cleared from the map**, not just the banner.
- The manual "Cerca in questa area" popover is fixed.

---

## 3. Data model: split match-types from search-types

`LOCATION_CATEGORIES[type].placeTypes` currently serves two masters and breaks
one of them. Split into two fields:

```typescript
export interface LocationCategory {
  readonly keywords: readonly string[];
  /** Types compared against a place's `types` for the Step-2 MATCH. Any string. */
  readonly matchTypes: readonly string[];
  /** Valid Google `searchNearby` includedTypes for DISCOVERY. Empty = not searchable. */
  readonly searchTypes: readonly string[];
}
```

- `matchTypes` = today's `placeTypes` (rename; behaviour identical — the matcher
  only intersects against returned `place.types`).
- `searchTypes` = curated, **Google-valid** types per category. Empty for
  categories that aren't searchable by type (`strada`, `interno_generico`,
  `altro`, `esterno_natura` partial). Verified against the live API.

### Curated `searchTypes` (validated against `places:searchNearby`)

| Category                 | searchTypes                                         |
| ------------------------ | --------------------------------------------------- |
| ristorante               | `restaurant, meal_takeaway, bakery`                 |
| bar                      | `bar, pub, night_club, cafe`                        |
| negozio                  | `store, supermarket, shopping_mall, clothing_store` |
| ufficio                  | `corporate_office`                                  |
| spiaggia                 | `beach`                                             |
| appartamento / casa      | `lodging` (best available proxy)                    |
| piazza                   | _(empty — `town_square` not searchable; skip)_      |
| strada                   | _(empty — exteriors aren't a POI type)_             |
| esterno_natura           | `park, campground, hiking_area`                     |
| interno_generico / altro | _(empty)_                                           |

> The list is **data**: extendable without touching logic. When Google adds/renames
> a type, edit the table. A startup probe (or a comment) records the validation date.

---

## 4. Scene-aware discovery

`discoverPlacesInArea` gains an optional `requirementId`:

- **With `requirementId`** (a scene/requirement is selected): resolve that one
  requirement's `locationType` → its `searchTypes` → query Places with exactly
  those. Match/affinity is computed against that single requirement.
- **`searchTypes` empty** (street, generic exterior): return an empty result with
  a typed reason `{ skipped: "not-searchable", type }` so the UI can say
  _"'Fuori Dalla Porta' è un esterno — non cerco posti per tipo. Disegna un'area o
  usa la ricerca libera."_
- **No `requirementId`** (nothing selected): keep today's all-requirements behaviour
  but with the union of **valid** `searchTypes` only (no `route`), so at least no
  garbage.

The page passes `selectedId` into the discovery call and **re-runs discovery when
`selectedId` changes** (fixes "suggestions don't change per scene").

No more `route`, so the `.orElse(unbiased)` fallback is removed — a 400 now means a
real error worth surfacing, not silent garbage.

---

## 5. Photos

`PlaceSuggestion` already carries `photos[].thumbnailUrl` (Google Places photo
proxied with the key). Wire it through:

- **Discovered pin popup** — show the first photo thumbnail next to name/address.
- **Manual "Cerca in questa area" rows** — already have `thumb`; keep.
- **Candidate rows** (`CandidateRow`) — already render `photos[0].url` when present;
  ensure discovered→added candidates persist `photoNames` so the thumbnail survives.
- **Affinity chips** stay text (a chip is too small for a photo); the photo lives on
  the candidate card the chip belongs to.

> Security note unchanged: the thumbnail URL embeds the Places key inline (see the
> existing SECURITY TODO). Out of scope here; a proxy endpoint is tracked separately.

---

## 6. Clear area from the map

When an area filter is active, render a small dismiss control **on the map**
(top-left, near the search box) — a pill "✕ Rimuovi area Fermo" — that calls the
same `onDismissAreaFilter` the banner uses. Clears the boundary layer, the drawn
shape, the discovery pins, and the filter state. Keyboard-accessible (react-aria
`useButton`).

---

## 7. Fix the "Cerca in questa area" popover

The `AreaSearchPanel` "Aggiungi a" `<select>` overlaps the results on small map
widths (img 5). Fix the popover layout: header → query row → requirement select →
results, each on its own row with proper stacking; constrain max-height with an
internal scroll for results. Default the "Aggiungi a" to the currently selected
requirement.

---

## 8. Out of scope (next phase — 37c)

- **Atmosphere ranking via Cesare.** Given the scene description + a candidate's
  name/rating/photos, have Cesare score "fits the mood" (Michelin vs trattoria,
  pub with a stage). This is the high-value layer; needs its own spec, mock
  fixtures, and cost smoke.
- **Free-text discovery merged into the auto flow** (type "pasticceria" to override
  the scene's types). The manual panel already does this; merging is a UX follow-up.

---

## 9. Tests

| Tag     | Level      | What                                                                        |
| ------- | ---------- | --------------------------------------------------------------------------- |
| OHW-376 | Vitest     | `searchTypesForType` returns valid sets; `strada`/`altro` empty             |
| OHW-377 | Vitest     | scene-aware selection: requirement → its searchTypes only                   |
| OHW-378 | Playwright | select scene A vs B → discovery pins differ (mock returns type-tagged sets) |
| OHW-379 | Playwright | clear-area control removes boundary + pins                                  |
| —       | manual     | photos visible in discovered pin popup (vernissage)                         |

Mock `searchPlacesInArea`/`fetchNearbyPlaces` gains type-aware fixtures so the
scene-aware E2E is deterministic (restaurant set vs bar set).
