# 10i — Breakdown deterministic pass with WordNet dictionary

Sub-spec of `10-breakdown`. Replaces the regex-only first pass introduced in `10e-auto-spoglio-regex`.

## Problem

The current deterministic auto-spoglio matches words via a regex on the scene text. The result is noisy: articles (`The`), adjectives, abstract nouns (`Stability`, `Integrity`, `Pride`), and stage directions (`Voice Over`, `V.O.`) end up as candidate elements. Users see ghost suggestions they immediately ignore, which trains them to ignore the whole feature.

There is no public film-prop dictionary. The closest open source-of-truth for "physical objects that can appear in a scene" is the WordNet `artifact.n.01` synset and its descendants — about 25 000 English nouns, mappable to Italian via MultiWordNet.

## Goal

Make the deterministic pass emit only words that are recognised as physical artifacts in the script's language. Cesare (Sonnet) keeps running in parallel as today and covers anything the dictionary misses.

## Non-goals

- No change to the Cesare pipeline (`10g`, `10g2`). Sonnet still runs on every version, on every scene, and produces ghost suggestions independently.
- No automatic language detection from text. The language comes from the project record.
- No synonym resolution, no lemmatisation beyond what the tokenizer provides natively, no runtime fetching of external dictionaries.
- No mobile or client-side dictionary use. The whitelist is a server-only asset.

## Design

### Pipeline

```
Scene text + project.locale
        │
        ▼
   Tokenize (compromise EN | wink-nlp IT)
        │
        ▼
   Keep tokens with POS ∈ { NOUN, PROPN }
        │
        ▼
   Lookup against WordNet artifact whitelist for the locale
        │
        ▼
   Emit occurrence { word, normalized, charOffset }
        │
        ▼
   Persist as cesareStatus = "pending"
```

Cesare runs unchanged in parallel and writes its own ghost suggestions; the user accepts/ignores from either source through the existing UI.

### Dictionary asset

Location: `packages/domain/src/dictionaries/`.

Files committed to the repo:

- `data/en.json` — `{ version: "wordnet-3.1", words: string[] }`, ~25 000 lemmas, ~800 KB gz.
- `data/it.json` — `{ version: "multiwordnet-1.39", words: string[] }`, ~15 000 lemmas, ~500 KB gz.

Public API:

```ts
export type Locale = "en" | "it";

export class DictionaryLoadError {
  readonly _tag = "DictionaryLoadError" as const;
  constructor(
    readonly locale: Locale,
    readonly cause: unknown,
  ) {}
}

export class UnsupportedLocaleError {
  readonly _tag = "UnsupportedLocaleError" as const;
  constructor(readonly locale: string) {}
}

// Lazy singleton, loaded once per process.
export const loadDictionary: (
  locale: Locale,
) => Result<ReadonlySet<string>, DictionaryLoadError | UnsupportedLocaleError>;
```

Words are stored lower-cased, NFC-normalized, accent-preserving for Italian.

### Build script

`packages/domain/scripts/build-dictionaries.ts`, run via `pnpm --filter @oh-writers/domain dict:build`. Steps:

1. Pull WordNet 3.1 via the `wordnet-db` npm package (MIT, ~30 MB, dev-only).
2. Walk descendants of `artifact.n.01`, collect all member lemmas.
3. Read MultiWordNet IT dump from `packages/domain/scripts/raw/multiwordnet-it.tsv` (CC-BY, checked in once, ~10 MB).
4. Join on synset offset, keep IT lemmas whose synset is in the EN artifact set.
5. Write `data/en.json` and `data/it.json`.

The script is documentation/maintenance only. CI does not run it. The generated JSON files are the source of truth committed to git.

### Element extraction

New module: `packages/domain/src/breakdown/extract-elements.ts`.

```ts
export interface ExtractedElement {
  readonly word: string; // surface form
  readonly normalized: string; // lower, NFC, used for the whitelist hit
  readonly charOffset: number; // start in the original text
}

export const extractElements: (input: {
  sceneText: string;
  locale: Locale;
}) => ResultAsync<
  ExtractedElement[],
  UnsupportedLocaleError | DictionaryLoadError
>;
```

Pure function. Framework-agnostic. Lives in `packages/domain` so the future mobile companion can reuse it.

### Server integration

`apps/web/app/features/breakdown/server/auto-spoglio.server.ts` is rewritten to call `extractElements` instead of the inline regex:

- Reads `projects.locale` for the active project.
- For each scene, calls `extractElements({ sceneText, locale })`.
- Writes occurrences exactly as today, with `cesareStatus = "pending"`.
- Existing `text_hash` short-circuit stays.
- Existing parallel Cesare path is untouched.

### Schema change

New column `projects.locale`:

```sql
ALTER TABLE projects
  ADD COLUMN locale text NOT NULL DEFAULT 'it'
  CHECK (locale IN ('en', 'it'));
```

Drizzle:

```ts
locale: text("locale", { enum: ["en", "it"] }).notNull().default("it"),
```

Migration: `pnpm db:migrate:create add-projects-locale`. Backfill is implicit via the default; no data migration needed.

### UI for locale

Project Settings page (`_app.projects.$id_.settings.tsx`) gets a new `<select>` under a `Lingua sceneggiatura` section:

- Options: `Italiano` (`it`), `English` (`en`).
- Server function `setProjectLocale` (validator: project id + locale enum) updates the row.
- Editing the locale invalidates the breakdown query so the next mount re-runs the deterministic pass.

A more complete locale story (full app i18n) is `Spec 18`. This spec adds only the screenplay locale needed for the dictionary lookup.

## Files touched / created

Created:

- `packages/domain/src/dictionaries/index.ts`
- `packages/domain/src/dictionaries/data/en.json`
- `packages/domain/src/dictionaries/data/it.json`
- `packages/domain/scripts/build-dictionaries.ts`
- `packages/domain/scripts/raw/multiwordnet-it.tsv` (raw source, committed)
- `packages/domain/src/breakdown/extract-elements.ts`
- `packages/db/src/migrations/NNNN_add_projects_locale.sql`

Modified:

- `packages/db/src/schema/projects.ts` — add `locale` column.
- `packages/domain/src/schemas/project.schema.ts` — add `locale` to the Zod schema.
- `apps/web/app/features/breakdown/server/auto-spoglio.server.ts` — replace regex with `extractElements`.
- `apps/web/app/routes/_app.projects.$id_.settings.tsx` — add the locale `<select>`.
- `apps/web/app/features/projects/server/projects.server.ts` (or wherever `updateProject` lives) — accept `locale` in the validator.

New dev dependencies:

- `wordnet-db` (dev-only, used by the build script).
- `compromise` (runtime, EN tokenizer).
- `wink-nlp` + `wink-eng-lite-web-model` and `wink-nlp-utils` (runtime, IT tokenizer; verify the IT model under `wink-nlp-pos-tagger-italian` or fall back to `compromise` with custom rules if no maintained IT model exists — confirm at implementation time).

## Bundle impact

- Dictionaries are imported only from `auto-spoglio.server.ts`, which is server-side code. Verified after `pnpm build` by inspecting the client manifest (target: dictionaries do not appear in any client chunk).
- Tokenizers ship with the server bundle only.

## Errors

- `DictionaryLoadError` — JSON missing or malformed at startup. Surfaces as a 500 from `auto-spoglio` with operator-readable cause; the regex pass is skipped, Cesare still runs.
- `UnsupportedLocaleError` — locale outside `'en' | 'it'`. Should be impossible given the `CHECK` constraint; defensive only.

## Tests

### Vitest

- `dictionaries.test.ts`
  - `loadDictionary("en")` returns ok and the set contains `"dartboard"`, `"helmet"`, `"tights"`.
  - The set does not contain `"the"`, `"stability"`, `"integrity"`, `"pride"`.
  - `loadDictionary("it")` contains `"bottiglia"`, `"tavolo"`, `"vino"`; does not contain `"il"`, `"della"`, `"bello"`.
- `extract-elements.test.ts`
  - EN: `"The dartboard hangs on the wall"` → `["dartboard", "wall"]`.
  - EN: `"Stability. Integrity. Pride."` → `[]`.
  - EN: `"V.O.: Watch and learn."` → `[]` (no artifact nouns).
  - IT: `"Una bottiglia di vino sul tavolo"` → `["bottiglia", "vino", "tavolo"]`.
  - Unknown locale → `err(UnsupportedLocaleError)`.
- `auto-spoglio.server.test.ts`
  - Given a scene containing `"dartboard"`, an occurrence is written with `cesareStatus = "pending"`.
  - Given a scene containing only `"Stability."`, no occurrence is written (Cesare path is mocked out for this test).

### Playwright

- `[OHW-10i-1]` Seed a project with locale `en` and a scene whose text is `"Stability. Integrity. Pride."`. Open the breakdown. Assert no ghost is shown for that scene.
- `[OHW-10i-2]` Seed a project with locale `en` and a scene containing `"dartboard"`. Open the breakdown. Assert a ghost for `dartboard` appears.
- `[OHW-10i-3]` Seed a project with locale `it` and a scene `"Una bottiglia sul tavolo"`. Assert ghosts for `bottiglia` and `tavolo`.
- `[OHW-10i-4]` Change the locale from `it` to `en` in Project Settings. Reopen the breakdown. Assert the deterministic pass re-ran against the new dictionary.

## Migration of existing data

After the migration is applied:

- All projects get `locale = 'it'` by default. Owners can change it in Settings.
- A one-shot script `pnpm scripts:rerun-auto-spoglio` iterates every screenplay version and triggers the new deterministic pass. Existing occurrences with `cesareStatus ∈ { 'accepted', 'ignored' }` are kept; only `pending` ones are re-derived.

## Rollout

Single PR. Mergeable after `10h`. No feature flag — the new pipeline is strictly more conservative than the current regex, so risk of regression is low.

## Open questions

- Confirm at implementation time that a usable IT POS-tagger exists in the `wink-nlp` ecosystem. If not, fall back to a curated IT stop-words filter combined with the WordNet whitelist and accept slightly higher recall noise on Italian.
