# Spec 38 — Context Engineering: Scene Summary + Film Bible + Location consumer

## Status

| Phase                                                        | Status   |
| ------------------------------------------------------------ | -------- |
| Phase 1 — Domain types (SceneSummary, FilmBible, templates)  | ✅ Built |
| Phase 2 — DB columns + migration                             | ✅ Built |
| Phase 3 — Scene summary generation (Haiku)                   | ✅ Built |
| Phase 4 — Bible distillation (Sonnet)                        | ✅ Built |
| Phase 5 — Cesare integration (cached block + location prior) | ✅ Built |

---

## Problem

A film set entirely in a provincial restaurant produces 7 separate location requirements
(Bancone / Sala / Cucina / Fuori dalla porta …). When the user asks Cesare to find
location candidates on the Locations page, Cesare responds with restaurants in Rome —
because it has no stable, distilled knowledge of the project's setting.

Root cause: `cesare.server.ts` injected raw, fragmented narrative documents into the
non-cached dynamic prompt block on every turn, paying full input cost and losing project
context coherence.

---

## Solution

Three artefacts, each derived from the previous:

```
scenes.notes (Fountain body)
        ↓ Haiku forced-tool (once per scene, debounced)
scenes.scene_summary (jsonb)  ←  SceneSummarySchema
        ↓
project_film_bible (jsonb)    ←  FilmBibleSchema
        ↑ Sonnet forced-tool (lazy re-distill on fingerprint mismatch)
        |   input: all scene_summary + active doc contents + project meta
        ↓
Cesare system prompt  ←  formatGlobalContext(bible)  [CACHED block]
        ↓ locations page only
buildLocationsToolsGuidance  ←  formatBibleForLocations(bible)  [setting prior]
```

---

## Domain model

### SceneSummarySchema (`packages/domain/src/scene-summary/schema.ts`)

```typescript
{
  sceneNumber: number,
  heading: string,
  settingDescription: string,   // what kind of place
  timeOfDay: string | null,
  presentCharacters: string[],
  keyActions: string[],         // ≤5 bullet points
  productionNotes: string[],    // stunt, sfx, etc.
}
```

Generated once per scene; fingerprint = sha256(scenes.notes). Only regenerated when the
body changes.

### FilmBibleSchema (`packages/domain/src/bible/schema.ts`)

```typescript
{
  schemaVersion: "1",           // Zod default, not sent to model
  settingSummary: string,       // 2-3 sentences: era, geography, tone
  genreAndTone: string,
  centralConflict: string,
  productionConstraints: string[],  // deduced from scenes: all exteriors, night, etc.
  recurringLocations: RecurringLocation[],
  keyCharacters: KeyCharacter[],
  sourceDocumentSnapshot: string,   // hash of inputs at distillation time
}

RecurringLocation {
  canonicalName: string,        // "Ristorante provinciale"
  aliases: string[],            // ["Bancone", "Sala", "Cucina"]
  locationType: string,
  sceneCount: number,
  settingPrior: string,         // "small-town restaurant, Marche region"
}
```

### Authority ordering (`packages/domain/src/bible/authority.ts`)

Document authority for fact resolution when documents disagree:

1. `treatment` — most detailed, closest to screenplay
2. `outline` — structural authority
3. `synopsis` — high-level
4. `soggetto` — draft source
5. `logline` — minimal

`resolveFact(facts: SourcedFact[]): ResolvedFact` picks the highest-authority fact; if
equal-authority facts conflict, marks as `contested`.

---

## Caching strategy

```
[ROLE_TEXT]          ← cache_control: ephemeral (unchanged across turns)
[FILM BIBLE]         ← cache_control: ephemeral (stable ~5min after distillation)
[PRODUCTION CONTEXT] ← cache_control: ephemeral
[TOOL GUIDANCE]      ← cache_control: ephemeral
[DYNAMIC STATE]      ← NOT cached (per-turn)
```

The bible block is the second block, right after ROLE_TEXT. This maximises cache hits
because the stable blocks are contiguous from the start of the array.

---

## Anti-stale guard (scene summary)

The fingerprint race: between dispatch and DB write, the user may have saved the
screenplay again. The update query is conditional:

```sql
UPDATE scenes
SET scene_summary = $summary, scene_summary_fingerprint = $fp
WHERE id = $id AND (scene_summary_fingerprint IS NULL OR scene_summary_fingerprint = $fp_at_dispatch)
```

If the row changed in the meantime, the write is a no-op. The next `refreshStaleSceneSummaries` call picks it up.

---

## Film Bible fingerprint

```typescript
computeBibleFingerprint = hash of (
  sorted scene_summary_fingerprints,
  sorted active document currentVersionIds,
  project genre + format + logline
)
```

`loadFilmBible` strategy:

- No row → distill synchronously once (first-time setup, ~2s, not on the critical path if
  done lazily before the first Cesare call)
- Row exists + fingerprint matches → return cached row immediately
- Row exists + fingerprint mismatch → return existing row (non-blocking), re-distill in
  background (debounced per projectId, 10s)

---

## Location prior ("the Rome fix")

`formatBibleForLocations(bible)` returns a setting-prior string injected into
`buildLocationsToolsGuidance`:

```
SETTING PRIOR (read before every search):
Il film è ambientato in: Ristorante provinciale nelle Marche, paesino di provincia.
Quando usi search_places, aggiungi sempre la città/regione del film come location_bias.
Non cercare a Roma o in città capitali a meno che il film non sia esplicitamente ambientato lì.
```

This is the fix for the "suggests Rome" bug.

---

## Tests

### Vitest (packages/domain)

| File                                             | Cases                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `scene-summary/schema.test.ts` [OHW-038a]        | round-trip, caps on arrays, optional fields                                                  |
| `bible/schema.test.ts` [OHW-038b]                | schemaVersion default, round-trip, recurringLocations                                        |
| `bible/authority.test.ts` [OHW-038c]             | empty, single, all-agree, hard conflict→contested, authority ordering                        |
| `context-templates/templates.test.ts` [OHW-038d] | deterministic MD, formatBibleForLocations contains setting prior + location_bias instruction |

### Vitest (apps/web)

| File                                                  | Cases                        |
| ----------------------------------------------------- | ---------------------------- |
| `predictions/scene-summary.server.test.ts` [OHW-038e] | fingerprint anti-stale guard |

### Mock E2E

`tests/cesare-agentic-context-engineering.spec.ts` [OHW-038f]:

- Saving "Non fa ridere" screenplay populates `scene_summary` on at least one scene
- Distilled bible groups Sala/Cucina/Bancone into one recurring location entry
- `[FILM BIBLE]` block is present in the captured system prompt (assert the prior text)

### Cost smoke (NOT in CI)

- `scripts/cost-smoke-bible.ts` — 2 real distillations, logs cache tokens
- `scripts/cost-smoke-scene-summary.ts` — 3 real summaries, logs cache tokens
