# Spec 37c — Atmosphere ranking (Cesare reads the scene)

> **Status:** built (2026-05-26)
> **Parent:** [37 — Location Matching & Area Discovery](./37-location-matching.md), [37b — Scene-aware discovery](./37b-discovery-scene-aware.md)
> **Owner:** locations feature + predictions (Cesare)

---

## 1. Problem

37b made discovery scene-aware by **type**: a `ristorante` scene returns restaurants,
a `bar` scene returns bars. But type is only the door. The user's question:

> "Horror in un ristorante stellato? Open mic in un pub? Cosa cercheresti?"

The right place depends on the scene's **mood**, which Google's `type` cannot
express:

- _Horror in a Michelin restaurant_ — both a fine-dining spot and a trattoria are
  `type=restaurant`. "Michelin / upscale / atmospheric" lives in **rating, price
  level, editorial summary, photos, name** — not the type.
- _Open mic in a pub_ — `type=bar` covers a quiet wine bar and a loud music pub.
  Which fits the scene's energy is a judgement, not a filter.

So after type-discovery returns N candidates, we need a **relevance pass** that
reads the scene and scores each place for fit. This is exactly Cesare's job.

---

## 2. Goal

For the **selected scene**, rank the discovered places by how well each fits the
scene's mood, and show a short Cesare reason per place ("locale elegante, luci
basse — adatto al tuo horror"). Deterministic match (37b) decides _what_ to show;
Cesare decides _the order_ and _the why_.

- Cesare ranking is **opt-in / on-demand**, not automatic on every area select —
  it costs API tokens and the deterministic order is fine for the common case.
- A "✦ Ordina per scena" affordance on the discovery results triggers it.
- `MOCK_AI=true` → deterministic mock ranking, no Anthropic calls.

---

## 3. Signals Cesare needs (and the data gap)

To judge atmosphere Cesare reads, per place:

| Signal                | Source                           | Status                      |
| --------------------- | -------------------------------- | --------------------------- |
| name                  | `PlaceSuggestion.name`           | have                        |
| types                 | `PlaceSuggestion.types`          | have                        |
| address               | `PlaceSuggestion.address`        | have                        |
| **rating**            | Google `places.rating`           | **missing from FIELD_MASK** |
| **price level**       | Google `places.priceLevel`       | **missing**                 |
| **editorial summary** | Google `places.editorialSummary` | **missing**                 |
| photo (thumb)         | `PlaceSuggestion.photos[0]`      | have                        |

And per scene:

| Signal                  | Source                                           | Status                    |
| ----------------------- | ------------------------------------------------ | ------------------------- |
| requirement name + type | `location_requirements`                          | have                      |
| scene headings          | `location_requirement_scenes` → `scenes.heading` | have (normalise loads it) |
| scene body / mood       | `scenes.notes` (Fountain body)                   | have via lazy-RAG pattern |

**Data gap to close first:** extend the Places `FIELD_MASK` to include
`places.rating,places.priceLevel,places.editorialSummary` and surface them on
`PlaceSuggestion`. Without them the ranking is guessing.

---

## 4. The ranking call

A new prediction server function (co-located in `features/predictions` or
`features/locations/server`, decide at impl):

```
rankPlacesForScene({ projectId, requirementId, places: PlaceSuggestion[] })
  → ResultShape<RankedPlace[], …>
```

- Loads the scene context for `requirementId` (headings + a trimmed `notes` body,
  reusing the lazy-RAG selection already built for Cesare).
- One **batch** Haiku call (structured output, `callHaiku` + `extractToolUse` —
  same pattern as fundraising `classifyItem`) scoring each place 0–1 for mood fit
  with a one-line Italian reason.
- Returns places sorted by score desc, each with `{ score, reason }`.
- Cost: one call per ranking action, ~1–2k tokens in, small out. Cached per
  (requirementId, area) for the session so re-opening doesn't re-call.

```typescript
interface RankedPlace {
  readonly placeId: string;
  readonly score: number; // 0..1 mood fit
  readonly reason: string; // IT, one line
}
```

System prompt sketch (Cesare voice, IT): _"Sei Cesare, location scout. Data la
scena e una lista di posti reali, ordina i posti per quanto si adattano
all'atmosfera della scena. Considera tono, luce, energia, classe del locale
(rating/prezzo/descrizione). Una riga di motivo per ciascuno."_

---

## 5. UI

- Discovery results (map pins + the panel list) gain a **"✦ Ordina per scena"**
  button. Until pressed, order is the deterministic 37b order.
- After ranking: pins/rows reorder by score; each shows Cesare's one-line reason
  (in the pin popup and the list row). A small "✦" marks AI-ranked items.
- Re-running on a different scene re-ranks (cache keyed by requirement).
- Reduced-motion safe; no layout jump beyond reorder.

---

## 6. Mock mode

`MOCK_AI=true` → `_mocks/rank.fixtures.ts`: a deterministic scorer (e.g. places
whose name contains "stellato"/"elegante" rank high for a "horror" scene; "pub"
ranks high for "open mic"). Keyed so the scene-aware ranking E2E is deterministic.

---

## 7. Out of scope

- Re-querying Google with different keywords per mood (we rank what type-discovery
  already returned; we don't do a second Places call).
- Photo-vision analysis (judging the actual image). Cesare reads metadata + name +
  editorial summary, not pixels. A vision pass is a separate future idea.

---

## 8. Tests

| Tag     | Level      | What                                                                               |
| ------- | ---------- | ---------------------------------------------------------------------------------- |
| OHW-380 | Vitest     | mock ranker: scene mood → expected order (stellato↑ for horror, pub↑ for open mic) |
| OHW-381 | Playwright | "Ordina per scena" reorders discovery results + shows reasons (mock)               |
| —       | Cost smoke | `cost:smoke:location-rank` — one real Haiku ranking, logs usage. Not in CI.        |
| —       | vernissage | screenshots of ranked results with reasons                                         |

---

## 9. Why this is a separate spec (not folded into 37b)

37b is deterministic and free; 37c adds an LLM, a cost surface, a mock, a cost
smoke, and a new UI affordance. Keeping it separate keeps 37b shippable and lets
the ranking be evaluated (and its cost measured) on its own.

---

> **Built 2026-05-26.** Shipped as specified:
>
> - **On-demand** "✦ Ordina per scena" pill on the map (under the clear-area
>   pill); deterministic 37b order until pressed. Decision confirmed with the user.
> - **Scene context** = requirement name + linked scene headings + trimmed
>   `scenes.notes` body (lazy-RAG style). Decision confirmed with the user.
> - Field mask extended (`rating`, `priceLevel`, `editorialSummary`) and surfaced
>   on `PlaceSuggestion`; `toNearbySuggestion` maps them (text-search path leaves
>   them null).
> - `rankPlacesForScene` server fn — one batch Haiku call (structured output) or
>   the deterministic `mockRankPlaces` heuristic under `MOCK_AI`. Reorders by
>   score; reasons appended to the hollow-pin popup label.
> - Session reorder + reasons cleared when area/scene changes (no stale ranking).
> - Tests: **OHW-380** (mock ranker unit, 5 cases) + **OHW-381** (E2E: rank pill
>   ranks the places). Cost smoke `pnpm cost:smoke:location-rank` (real Haiku,
>   not in CI). 56 unit + 5 E2E green.
> - Vision/photo analysis stays out of scope (Cesare reads metadata, not pixels).
