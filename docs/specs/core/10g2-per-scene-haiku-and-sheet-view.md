# Spec 10g.2 — Per-scene Haiku incremental + Movie Magic-style sheet

> Sub-spec of [10g — LLM-at-import full breakdown](./10g-llm-at-import-breakdown.md).
> Status: **draft (awaiting approval)**.
> Owner: Valerio.

---

## Why this exists

Spec 10g shipped two things and explicitly deferred two more:

| Landed in 10g            | Deferred to 10g.2                                 |
| ------------------------ | ------------------------------------------------- |
| Sonnet full-version run  | **Per-scene Haiku incremental on edit**           |
| Per-element project view | **Movie Magic-style breakdown sheet (per scene)** |

The two deferred items are the next pieces of the AD-pillar bet — without
them Cesare can't credibly replace Movie Magic for an Italian 1st AD:

1. The screenplay is a living doc; once Sonnet runs at import, a single
   scene rewrite must NOT re-trigger a $0.08, 45 s re-run. Haiku is the
   right tool: same tool-call shape as Sonnet, ~150× cheaper, ~10× faster,
   and the per-scene scope keeps the prompt small enough to fit in the
   prompt-cache window.
2. Producers and 1st ADs read breakdowns in a **scene × category grid**,
   not as a flat element list. The current "Per progetto" tab is great
   for "where does this car appear?" but useless for "what do I need to
   prep for scene 14?". Movie Magic Scheduling has owned this layout for
   30 years; matching it is table stakes.

---

## Out of scope

- Live collaborative editing of the sheet (tracked in Spec 11 — Schedule).
- A different tool definition for Haiku — we deliberately reuse
  `LLM_SPOGLIO_TOOL_DEFINITION` so the persistence path is identical.
- A separate cost meter / budget cap UI (Spec 18 — Cost dashboard).

---

## Slice A — Haiku per-scene incremental re-spoglio

### Trigger

A scene's `notes` change in the Yjs doc → debounce 3 s → server fn
`respoglioSceneWithHaiku({ sceneId, screenplayVersionId })`.

The debounce lives client-side in the screenplay editor (not the
breakdown page) because the editor is the single writer of scene text.
A passive subscriber (the breakdown page) would race against the writer.

### Server function

```ts
respoglioSceneWithHaiku({ sceneId: uuid, screenplayVersionId: uuid })
  → ResultShape<{ persisted: number; cached: boolean; modelUsed: string }, …>
```

Behavior:

1. Auth + canEditBreakdown.
2. Load scene + scene state.
3. Hash `heading + "\n" + notes` → if equal to the stored
   `haikuTextHash` and `lastHaikuRunAt` is set → short-circuit
   (`cached: true`).
4. Build the same `LLM_SPOGLIO_TOOL_DEFINITION` prompt but scoped to
   one scene. The system prompt remains identical (cached ephemeral).
5. Call `claude-haiku-4-5` with `tool_choice` forcing
   `submit_full_script_breakdown` and a single-scene payload
   (`scenes: [{ sceneNumber: 1, heading, body }]`).
6. Reuse the existing `persistSceneItems` helper from
   `llm-spoglio.server.ts` (extract to a shared file).
7. Stamp `lastHaikuRunAt = now`, `haikuTextHash = currentHash`.

### Schema change — additive

Add to `breakdown_scene_state` (Spec 10e already defined the row):

```ts
lastHaikuRunAt: timestamp("last_haiku_run_at"),
haikuTextHash:  text("haiku_text_hash"),
```

A new migration; **no data backfill needed** (NULL means "never ran",
which short-circuits to "first call will run").

### Mock mode

`MOCK_AI=true` → call `mockFullScriptBreakdown([{ sceneNumber: 1, heading,
body }])` and persist the single result. Same fixture as 10g, no new
mocks required.

### Permissions

- Editors: implicit auto-trigger via debounce.
- Viewers: not subscribed (read-only); the editor never fires the
  mutation in their context.

### Cost guardrail

Hard cap: max **5 Haiku runs per scene per minute** (server-side rate
limit, similar pattern to `cesare-suggest`'s 60 s cooldown). Burst of
typing inside one scene must not flood the API.

---

## Slice B — Movie Magic-style breakdown sheet

### New tab

The Breakdown page header gains a third tab after "Per scena" and "Per
progetto":

```
[ Per scena ] [ Per progetto ] [ Sheet (AD) ]
```

### Layout

A `DataTable` (existing DS atom) with:

| Col          | Source                                  |
| ------------ | --------------------------------------- |
| `#`          | `scene.number`                          |
| `INT/EXT`    | `scene.intExt`                          |
| `Location`   | `scene.location`                        |
| `Time`       | `scene.timeOfDay`                       |
| `Pages`      | placeholder `—` (Spec 11 supplies real) |
| `Cast`       | comma-separated accepted cast names     |
| `Props`      | …                                       |
| `Vehicles`   | …                                       |
| `Animals`    | …                                       |
| `Extras`     | …                                       |
| `Sound`      | …                                       |
| `Atmosphere` | …                                       |
| `Makeup`     | …                                       |
| `Stunts`     | …                                       |
| `VFX`        | …                                       |

Cell rendering:

- **Accepted** occurrences → plain text, comma-separated.
- **Pending ghosts** → italic, dimmer color (`var(--color-text-muted)`),
  rendered after accepted ones.
- **Ignored** → omitted entirely.
- Empty cells → `—` (em dash).

Only categories with at least one occurrence in the version get a
column (no point in a sea of empty Stunts cells if the script has none).

### Density toggle

`[Compact] [Comfortable]` button group above the table. Persists to
`localStorage` keyed by `userId`.

### Export

Reuse the existing PDF export pipeline (Spec 10f). New format:
`"breakdown-sheet"`. Renders the same table at landscape A4 with the
project title and version label in the header.

### Server function

```ts
getBreakdownSheet({ projectId: uuid, screenplayVersionId: uuid })
  → ResultShape<BreakdownSheetRow[], …>

interface BreakdownSheetRow {
  sceneNumber: number;
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: string | null;
  byCategory: Partial<Record<BreakdownCategory, {
    accepted: { id: string; name: string; quantity: number }[];
    pending:  { id: string; name: string; quantity: number }[];
  }>>;
}
```

The shape is computed server-side so the client doesn't reimplement
joins. Cached via `queryOptions` keyed by `(projectId, versionId)`.

### Permissions

Sheet visible to viewers and editors. Only editors can use the
right-click context menu on a cell to accept/ignore a pending name
(the action reuses Spec 10c's existing mutations).

---

## Tests

### Unit (Vitest)

- `extractSceneForHaikuPrompt(scene)` → returns the prompt-shaped
  payload; deterministic.
- `respoglioSceneWithHaiku` cache short-circuit (text-hash match).
- `groupOccurrencesBySceneAndCategory` pure helper for the sheet
  builder.
- `BreakdownSheetRow` Zod schema round-trip.

### E2E (Playwright)

- `[OHW-340-ui]` Sheet tab visible to editor.
- `[OHW-340-permissions]` Sheet tab visible to viewer (read-only).
- `[OHW-341]` Editor types a new character into scene 3 → debounce
  fires → Haiku run completes → cell for scene 3 in Sheet tab gains
  the new name (MOCK_AI=true).
- `[OHW-342]` Density toggle persists across reload.

The full Anthropic round-trip stays out of CI (same constraint as
10g) — covered by unit tests on the prompt builder + persistence
helper.

---

## Migration plan

1. Schema migration adds the two columns to `breakdown_scene_state`
   (nullable, no default).
2. Slice A lands behind a new env-var feature flag
   `LLM_PER_SCENE_BREAKDOWN=true`. Mock mode flips on automatically
   when MOCK_AI is set.
3. Slice B lands unconditionally — the table can render even if no
   Haiku ever ran (it just shows whatever the regex/Sonnet path
   already populated).

Slice A and Slice B can be reviewed and merged independently. Slice
B has no dependency on Slice A.

---

## Open questions (resolve before coding starts)

1. **Debounce window** — 3 s feels right for typing pauses; do we
   want a "blur the editor" trigger as a fallback? **Proposed: yes,
   blur fires the Haiku call immediately, debounce remains the
   typing-pause path.**
2. **Sheet column order** — Movie Magic uses
   Cast → Stunts → Extras → Props → Vehicles → Animals → Wardrobe →
   Makeup → SFX → Sound → Special Equipment → Set Dressing → Greenery
   → VFX → Music → Notes. We map our 10 categories to a stable order
   (above). **Proposed: hard-coded order in `CATEGORY_META`.**
3. **Cost meter** — show the per-version cumulative LLM spend as a
   tooltip on the AI dropdown? **Proposed: defer to Spec 18.**
