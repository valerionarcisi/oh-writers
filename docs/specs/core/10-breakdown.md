# Spec 10 — Scene Breakdown (Cesare-driven, MM-style)

## Goal

Trasformare la sceneggiatura in un **breakdown di produzione**: ogni scena viene scomposta nei suoi elementi (cast, props, location, veicoli, VFX, ecc.) classificati per categoria, navigabili per scena o consolidati a livello progetto, esportabili in formato Movie Magic-style. Cesare (AI) propone proattivamente gli elementi via inline ghost suggestions; l'utente conferma, ignora o aggiunge manualmente. Mai chat laterale, mai popup intrusivi.

Il breakdown alimenterà:

- **Schedule (Spec 12)** — il piano di lavorazione (strip board) clusterizza le scene in giornate di riprese ottimizzate per cast/location/time-of-day. Senza breakdown non si può fare scheduling: serve sapere quali scene condividono cast, location, equipaggiamento.
- **Budget (Spec 11)** — ogni categoria elemento mappa a una o più linee di budget (cast → cachet, vehicles → noleggio, vfx → post-produzione)
- **Locations (Spec 13)** — gli element di categoria `locations` diventano candidati per scouting, sopralluoghi, attachment foto/contratti

## Status at spec time

Feature non implementata. Esisteva una bozza precedente (10 categorie, sheet-per-scena, no registry, no version-awareness) **sostituita integralmente** da questo spec dopo il brainstorm del 2026-04-20.

Niente codice esistente in `apps/web/app/features/breakdown/` (cartella da creare). Niente schema DB esistente per elements/occurrences.

## Out of scope (v1)

- **Locations feature completa** — qui Location è solo una categoria-tag (testo libero). La feature scouting/candidates/attachments è Spec 13. Quando arriverà, gli element di categoria `locations` si auto-linkeranno via name match.
- **Cast feature completa** — stessa logica: qui Cast è una categoria del breakdown; la gestione personaggi (foto, bio, casting status) è feature successiva.
- **Conflict resolution multi-utente real-time** — i tag sono persistiti via server fn standard; collaboration Yjs è solo per l'editor screenplay. Concurrency su breakdown è ottimistica (DB unique constraint + retry).
- **Import esterno** (Movie Magic XML, Filmustage CSV) — non in v1.
- **Strip board / scheduling drag-drop** — quello è Spec 12.
- **Cesare conversazionale** ("ask Cesare anything") — Cesare qui produce solo output strutturato via tool-use. Niente textbox di chat. Pattern obbligatorio in tutto Oh Writers.
- **Custom categorie utente** — categorie sono enum fisso (14, MM-standard). Estensibili in spec successivo se serve.
- **Re-anchoring con offset di carattere** — gli highlight sono ricalcolati a runtime cercando `element.name` nel testo della scena. No `start/end` offset persistiti.

## Decisioni chiave (recap brainstorm)

| Aspetto                   | Scelta                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **AI**                    | Cesare-from-day-one, Haiku 4.5, prompt caching, MOCK_AI in dev/test, default per-scena, rate-limit "all-script"        |
| **Pattern Cesare**        | Ghost suggestions inline (border tratteggiato + opacity 0.6 + ✨), `cesare_status: pending/accepted/ignored`, mai chat |
| **Categorie**             | 14 MM-standard (vedi tabella sotto)                                                                                    |
| **Element model**         | Registry globale per progetto + occorrenze per `(scene_id, screenplay_version_id)` (Hybrid C)                          |
| **Highlight storage**     | Solo `(scene_id, element_id)` — re-match runtime per nome, no offset                                                   |
| **Tag UX**                | Selezione testo in script readonly → context-menu "Tagga come…"                                                        |
| **Versioning**            | Element registry è per-progetto (rinomine cascade); occorrenze per-versione (snapshot per ogni screenplay_version)     |
| **Stale awareness**       | 3 livelli — L1 hash + re-match on view · L2 badge passivo nell'editor · L3 banner alla creazione nuova versione        |
| **Permessi**              | Read = chi vede il progetto. Write = stesso permission set dello screenplay (owner + editor)                           |
| **Export v1**             | PDF MM-style (Per scena + Per progetto) + CSV (Per progetto). No JSON, no FDX.                                         |
| **Cancellazione element** | Soft delete (`archived_at`), recuperabile                                                                              |

### Categorie elementi (14, MM-standard)

| ID        | IT               | EN            | Color token               | Icona |
| --------- | ---------------- | ------------- | ------------------------- | ----- |
| cast      | Cast             | Cast          | `--cat-cast` (yellow)     | C     |
| extras    | Comparse         | Extras        | `--cat-extras` (green)    | E     |
| stunts    | Stunt            | Stunts        | `--cat-stunts` (orange)   | ST    |
| props     | Oggetti          | Props         | `--cat-props` (purple)    | P     |
| vehicles  | Veicoli          | Vehicles      | `--cat-vehicles` (pink)   | V     |
| wardrobe  | Costumi          | Wardrobe      | `--cat-wardrobe` (cyan)   | W     |
| makeup    | Trucco           | Makeup/Hair   | `--cat-makeup` (lt-pink)  | M     |
| sfx       | Effetti speciali | SFX           | `--cat-sfx` (blue)        | SFX   |
| vfx       | VFX              | VFX           | `--cat-vfx` (lt-blue)     | VFX   |
| sound     | Suono            | Sound FX      | `--cat-sound` (red)       | SND   |
| animals   | Animali          | Animals       | `--cat-animals` (magenta) | A     |
| set_dress | Scenografia      | Set Dressing  | `--cat-set-dress` (teal)  | SD    |
| equipment | Attrezzatura     | Sp. Equipment | `--cat-equipment` (brown) | EQ    |
| locations | Location         | Locations     | `--cat-locations`         | L     |

I `--cat-*` token vivono in `packages/ui/src/styles/tokens.css`. Affiancare sempre **colore + icona/iniziale** (accessibilità daltonici + script densi).

## Domain model

### Zod schemas (in `packages/domain/src/breakdown/`)

```typescript
export const BREAKDOWN_CATEGORIES = [
  "cast",
  "extras",
  "stunts",
  "props",
  "vehicles",
  "wardrobe",
  "makeup",
  "sfx",
  "vfx",
  "sound",
  "animals",
  "set_dress",
  "equipment",
  "locations",
] as const;

export const BreakdownCategorySchema = z.enum(BREAKDOWN_CATEGORIES);
export type BreakdownCategory = z.infer<typeof BreakdownCategorySchema>;

export const CesareStatusSchema = z.enum(["pending", "accepted", "ignored"]);
export type CesareStatus = z.infer<typeof CesareStatusSchema>;

export const BreakdownElementSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  category: BreakdownCategorySchema,
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BreakdownElement = z.infer<typeof BreakdownElementSchema>;

export const BreakdownOccurrenceSchema = z.object({
  id: z.string().uuid(),
  elementId: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
  sceneId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  note: z.string().nullable(),
  cesareStatus: CesareStatusSchema,
  isStale: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BreakdownOccurrence = z.infer<typeof BreakdownOccurrenceSchema>;

export const BreakdownSceneStateSchema = z.object({
  id: z.string().uuid(),
  screenplayVersionId: z.string().uuid(),
  sceneId: z.string().uuid(),
  textHash: z.string(), // sha256 of normalized scene text at last breakdown
  lastCesareRunAt: z.string().datetime().nullable(),
  pageEighths: z.number().int().positive().nullable(), // page count in eighths
});
export type BreakdownSceneState = z.infer<typeof BreakdownSceneStateSchema>;
```

### Drizzle schema (in `packages/db/src/schema/breakdown.ts`)

```typescript
export const breakdownElements = pgTable(
  "breakdown_elements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: text("category", { enum: BREAKDOWN_CATEGORIES }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Un solo element per (project, category, name) — abilita merge-on-create
    unique().on(t.projectId, t.category, t.name),
  ],
);

export const breakdownOccurrences = pgTable(
  "breakdown_occurrences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    elementId: uuid("element_id")
      .notNull()
      .references(() => breakdownElements.id, { onDelete: "cascade" }),
    screenplayVersionId: uuid("screenplay_version_id").notNull(), // FK a versions table (vedi Spec 06)
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    note: text("note"),
    cesareStatus: text("cesare_status", {
      enum: ["pending", "accepted", "ignored"],
    })
      .notNull()
      .default("accepted"),
    isStale: boolean("is_stale").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Una sola occorrenza per (element, version, scene)
    unique().on(t.elementId, t.screenplayVersionId, t.sceneId),
  ],
);

export const breakdownSceneState = pgTable(
  "breakdown_scene_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    screenplayVersionId: uuid("screenplay_version_id").notNull(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    textHash: text("text_hash").notNull(),
    lastCesareRunAt: timestamp("last_cesare_run_at"),
    pageEighths: integer("page_eighths"),
  },
  (t) => [unique().on(t.screenplayVersionId, t.sceneId)],
);
```

**Cascade rules:**

- `projects` deleted → tutti gli elements + occorrenze + state (cascade)
- `scenes` deleted → occurrences + state della scena (cascade); element global resta
- `screenplay_version` deleted → occurrences + state della versione (cascade); element global resta
- Element archived (soft) → occurrences restano ma non sono mostrate (filtro UI)

### Versioning behavior (Hybrid C)

- **Element** vive a livello `projectId`: rinomine, descrizioni, archiviazioni si propagano automaticamente a tutte le versioni dello screenplay.
- **Occurrence** vive a livello `(elementId, screenplayVersionId, sceneId)`: ogni screenplay version ha il suo set di occorrenze.
- **Alla creazione di una nuova screenplay version**: server fn `cloneBreakdownToVersion(fromVersionId, toVersionId)` clona le occorrenze, ricalcola `textHash`, esegue re-match runtime, marca `isStale=true` quelle che non matchano più. L'utente vede subito cosa è da rivedere.
- L'azione di clonazione è **opt-in**: alla creazione di nuova versione, banner `[L3] Importa breakdown da vN?` (default Sì). Spec 06 (versioning) deve esporre l'hook `onVersionCreated`.

## Permission model

| Ruolo                         | Read breakdown | Add/edit/delete element | Run Cesare | Export |
| ----------------------------- | -------------- | ----------------------- | ---------- | ------ |
| Owner del progetto (personal) | ✅             | ✅                      | ✅         | ✅     |
| Team member con role `owner`  | ✅             | ✅                      | ✅         | ✅     |
| Team member con role `editor` | ✅             | ✅                      | ✅         | ✅     |
| Team member con role `viewer` | ✅             | ❌                      | ❌         | ✅     |
| Non-membro                    | ❌ (403)       | ❌                      | ❌         | ❌     |

Logica identica a `screenplay-editor`. Riusare `canEditScreenplay(user, project)` da `features/screenplay-editor/lib/permissions.ts`.

## Design system prerequisites

| Componente    | Stato           | Note                                                                                                                 |
| ------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Button`      | `[EXISTING DS]` | Riuso                                                                                                                |
| `Dialog`      | `[EXISTING DS]` | Per modal "Aggiungi manualmente", "Importa breakdown"                                                                |
| `Tabs`        | `[EXISTING DS]` | Per `[Per scena] [Per progetto] [Export]`                                                                            |
| `Input`       | `[EXISTING DS]` | Form fields                                                                                                          |
| `FormField`   | `[EXISTING DS]` | Form fields                                                                                                          |
| `EmptyState`  | `[EXISTING DS]` | Scena senza elementi, progetto senza breakdown                                                                       |
| `Skeleton`    | `[EXISTING DS]` | Loading Cesare                                                                                                       |
| `Toast`       | `[EXISTING DS]` | Errori (Cesare non disponibile, save failed)                                                                         |
| `Badge`       | `[EXTEND DS]`   | Aggiungere variante `count` (numero in pill) e `stale` (warning)                                                     |
| `Tag`         | `[NEW DS]`      | Color + icon + count + variante `ghost` (border tratteggiato, opacity 0.6 per Cesare suggestions)                    |
| `Banner`      | `[NEW DS]`      | Inline persistent banner non-bloccante con CTA, distinto da Toast (transient). Varianti: `info`, `cesare`, `warning` |
| `ContextMenu` | `[NEW DS]`      | Per "Tagga come…" su selezione testo nello script                                                                    |
| `DataTable`   | `[NEW DS]`      | Tabella sortable + filtrable per vista "Per progetto"; v1 leggera, no virtualization (la aggiungiamo se servirà)     |

**Token CSS da aggiungere** in `packages/ui/src/styles/tokens.css`:

```css
:root {
  /* Breakdown category palette (Movie Magic standard) */
  --cat-cast: oklch(...); /* yellow */
  --cat-extras: oklch(...); /* green */
  --cat-stunts: oklch(...); /* orange */
  --cat-props: oklch(...); /* purple */
  --cat-vehicles: oklch(...); /* pink */
  --cat-wardrobe: oklch(...); /* cyan */
  --cat-makeup: oklch(...); /* light pink */
  --cat-sfx: oklch(...); /* blue */
  --cat-vfx: oklch(...); /* light blue */
  --cat-sound: oklch(...); /* red */
  --cat-animals: oklch(...); /* magenta */
  --cat-set-dress: oklch(...); /* teal */
  --cat-equipment: oklch(...); /* brown */
  --cat-locations: oklch(...); /* neutral grey-link */
}
```

I valori OKLCH precisi vanno scelti in fase di implementazione testando contrast vs `--color-bg-*` (target WCAG AA su large text).

## UX flows + diagrammi

### Layout — Scene Breakdown (vista primaria)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Blade Runner 2099 / v3 (active)                                  [Export ▾]  │
│  Tabs: [Per scena ●] [Per progetto] [Export]                                  │
├──────────────┬─────────────────────────────────────────┬──────────────────────┤
│  Scene TOC   │  SCENE 12 — INT. WAREHOUSE — NIGHT      │ Elementi (scena 12)  │
│              │  page 14 · 1 6/8 pp        [✨ Cesare]  │                      │
│  Filtri      │  ────────────────────────────────       │ ▾ CAST (3)           │
│  ☑ Cast      │                                         │   • Rick             │
│  ☑ Props     │  RICK enters carrying a BLOODY KNIFE.   │   • Roy              │
│  ☑ Vehicles  │   ╰C╯                       ╰──P────╯   │   • Pris             │
│  ☑ Extras    │                                         │ ▾ PROPS (5)          │
│  ☑ …         │  Three POLICE CARS block the exit.      │   • Bloody knife ×1  │
│              │           ╰──V────╯                     │   • Blaster      ×2  │
│  ───────     │                                         │   • ✨ Helmet ⊘×1   │ ← ghost
│  Scenes:     │  A DOG barks. 50 EXTRAS storm in.       │ ▾ VEHICLES (1)       │
│  ▸ 1 INT.    │     ╰A╯       ╰──E────╯                 │   • Police car   ×3  │
│  ▸ 2 EXT.    │                                         │ ▾ EXTRAS             │
│  ▼ 12 INT.⚠  │  RICK                                   │   • Riot squad   ×50 │
│  ▸ 13 EXT.   │      Get back!                          │ ▾ ANIMALS            │
│  ▸ 14 INT.   │                                         │   • Dog          ×1  │
│              │  (selection-only · scrollable)          │                      │
│              │  Selezione → menu "Tagga come…"         │ + Aggiungi manuale   │
│              │                                         │ ✨ Suggerisci scena  │
└──────────────┴─────────────────────────────────────────┴──────────────────────┘
```

- **TOC sx**: lista scene con badge `⚠` su quelle stale; sotto, filtri categoria (toggle visibilità highlight)
- **Center**: script readonly **selection-only** (no edit), con highlight color-coded + iniziale categoria
- **Pannello dx**: elementi della scena corrente raggruppati per categoria. Ghost suggestions con icona `✨` e opacity ridotta.

### Layout — Per Progetto (vista consolidata)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Tabs: [Per scena] [Per progetto ●] [Export]                                  │
│  Filtri: [Cat ▾] [Search________] [Solo stale ☐]   N elementi · ⚠ 12 stale   │
├───────────────────────────────────────────────────────────────────────────────┤
│  Elemento            │ Cat │ Scene presence              │ Tot │ Note         │
│ ─────────────────────┼─────┼─────────────────────────────┼─────┼───────────── │
│  Bloody knife        │  P  │ 1, 12, 30                   │  3  │              │
│  Police car          │  V  │ 12, 13, 13a                 │  9  │ Ford crown   │
│  Rick                │  C  │ 1, 2, 3, 12… (47)           │ 47  │ Lead         │
│  Riot squad          │  E  │ 12, 13                      │ 100 │              │
│  Warehouse           │  L  │ 12, 14                      │  2  │ Practical    │
│  ⚠ Hunting knife     │  P  │ 30 (stale)                  │  1  │              │
│  …                                                                            │
└───────────────────────────────────────────────────────────────────────────────┘
```

- Tabella sortable per ogni colonna, filtri persistenti in URL state
- Click su element row → drawer/modal con dettagli + lista occurrences
- Riga rinomina/cancella tramite menu contestuale per riga

### Layout — Cesare suggestion banner

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  ✨ Cesare ha proposto 8 elementi per questa scena                            │
│  [Vedi elenco]  [Accetta tutti]  [Ignora]                                  ✕  │
└───────────────────────────────────────────────────────────────────────────────┘
```

Banner non-bloccante in cima al pannello dx. Sparisce a primo gesture (accept/ignore/dismiss).

### Editor — badge passivo (L2 stale awareness)

Dentro `ScreenplayEditor`, accanto al heading di ogni scena con breakdown stale:

```
SCENE 12 — INT. WAREHOUSE — NIGHT  [⚠ breakdown da rivedere]
```

Una sola query leggera all'apertura editor: `getStaleScenes(screenplayVersionId)` → array di `sceneId`. Click sul badge → naviga a `/projects/:id/breakdown?scene=:sceneId`.

### Banner alla creazione nuova versione (L3)

Dopo `cloneBreakdownToVersion`, in cima al breakdown della nuova versione:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  ⚠  12 elementi in 4 scene potrebbero essere obsoleti dopo le tue modifiche.  │
│     [Rivedi nel breakdown]                                                 ✕  │
└───────────────────────────────────────────────────────────────────────────────┘
```

Persiste finché l'utente non apre la breakdown almeno una volta dopo la creazione versione.

## Cesare integration

### Pattern (vincolante)

Vedi memory `feedback-cesare-controller-pattern.md`. Riassunto: ghost inline + banner garbato + `cesare_status` + indicator passivo. **Mai chat**, mai popup intrusivi, mai textbox di domande aperte.

### Quando si attiva Cesare

1. **Auto-suggest alla prima apertura di una scena senza breakdown** (background, no spinner; banner appare quando completa)
2. **Manuale via "✨ Suggerisci scena"** (toolbar pannello dx) — ri-run anche su scene con breakdown già confermato; gli `accepted` esistenti restano, gli `ignored` non vengono ri-proposti, i nuovi candidati appaiono come `pending`
3. **Manuale via "✨ Suggerisci tutto lo script"** (toolbar globale) — rate-limited: max 1 ogni 5 minuti per progetto; mostra progress per scena

### Server fn

```typescript
export const suggestBreakdownForScene = createServerFn({ method: "POST" })
  .validator(z.object({
    sceneId: z.string().uuid(),
    screenplayVersionId: z.string().uuid(),
  }))
  .handler(async ({ data }): Promise<ResultShape<SuggestBreakdownResult, ...>> => {
    // 1. requireUser + permission check (canEditScreenplay)
    // 2. load scene text + heading metadata
    // 3. if MOCK_AI=true → return canned response from mocks/ai-responses.ts
    // 4. else → Anthropic Haiku 4.5 with prompt caching
    //    - system prompt: breakdown extraction instructions (cached)
    //    - few-shot: 3 esempi (cached)
    //    - user: scene text + categorie attive
    //    - tool-use: returns SuggestionListSchema (strict JSON)
    // 5. for each suggested element:
    //    - upsert breakdownElements by (projectId, category, normalize(name))
    //    - insert breakdownOccurrences with cesareStatus='pending'
    //    - skip if already exists with status 'ignored' or 'accepted'
    // 6. update breakdownSceneState.lastCesareRunAt + textHash
    // 7. return { newPending: count, banner: SuggestionBannerData }
  });
```

### Suggestion schema (tool-use output)

```typescript
const CesareSuggestionSchema = z.object({
  category: BreakdownCategorySchema,
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive().default(1),
  description: z.string().nullable(),
  rationale: z.string().nullable(), // motivazione breve, mostrata in tooltip
});

const SuggestionListSchema = z.object({
  suggestions: z.array(CesareSuggestionSchema),
});
```

### Costo (stima)

- Haiku 4.5: ~$0.80/M input, ~$4/M output
- Per scena: ~500 token in (testo) + ~200 cache write (1ª volta) + ~300 token out
- Con cache hit: ~$0.001-0.002/scena
- Film 100 scene: ~$0.10-0.20 totali per breakdown completo

### Mock per dev/test

`mocks/ai-responses.ts` deve esporre `mockCesareBreakdownForScene(sceneFixtureId)` che ritorna deterministicamente:

- per fixture "scene-warehouse-12" → 8 suggestions (3 cast, 5 props, 1 vehicle, 50 extras, 1 animal)
- per fixture "scene-empty" → 0 suggestions
- per altre scene → derive dal testo via regex CAPS (fallback semplice)

## Stale awareness (3 livelli)

### L1 — Re-match runtime (server)

Quando l'utente apre la vista breakdown:

1. Per ogni scena visibile, computa `currentTextHash = sha256(normalize(sceneText))`
2. Confronta con `breakdownSceneState.textHash`
3. Se diverso:
   - Per ogni occurrence della scena: cerca `element.name` nel testo nuovo (case-insensitive, word-boundary)
   - Trovato → `isStale=false`
   - Non trovato → `isStale=true`
   - Update `breakdownSceneState.textHash` al nuovo valore

Computazione **on-demand** (apertura breakdown view) — nessun overhead a write-time dell'editor.

### L2 — Badge passivo nello screenplay editor

Server fn leggera `getStaleScenes(screenplayVersionId)` → array di `sceneId`. Editor la chiama una volta all'apertura. Badge `⚠ breakdown da rivedere` accanto al heading scena. Click → naviga al breakdown.

L'editor non sa nulla degli element specifici; solo "questa scena ha breakdown stale".

### L3 — Banner alla creazione nuova versione

Hook `onVersionCreated` (Spec 06) chiama `cloneBreakdownToVersion(prevVersionId, newVersionId)`:

1. Copia tutte le occurrences della versione precedente
2. Ricalcola hash + re-match per ogni scena
3. Marca `isStale=true` quelle che non matchano
4. Banner appare nella prossima apertura del breakdown della nuova versione

## Use cases E2E

Tag format: `[OHW-NNN]`. Tutti i test sono Playwright + MOCK_AI=true.

### Happy path

| ID      | Titolo                                                                                              | Note                               |
| ------- | --------------------------------------------------------------------------------------------------- | ---------------------------------- |
| OHW-240 | Apri /breakdown prima volta, Cesare auto-suggerisce, banner ✨ visibile, ghost tags nel pannello dx | 8 suggestions per scena fixture    |
| OHW-241 | Click su singolo ghost tag → diventa pieno (accepted)                                               | `cesareStatus: pending → accepted` |
| OHW-242 | "Accetta tutti" della scena → tutti i pending → accepted bulk                                       | banner sparisce                    |
| OHW-243 | Click "Ignora" su un ghost tag → status ignored, sparisce dalla lista                               | ri-run Cesare non lo ripropone     |
| OHW-244 | "+ Aggiungi manualmente" → modal form → submit → element creato + occurrence                        | quantity default 1                 |
| OHW-245 | Selezione testo nello script → context menu "Tagga come Props" → element creato                     | tag-from-script UX                 |
| OHW-246 | Tab "Per progetto" → tabella consolidata, sortable per Tot, filtrabile per categoria                | 14 categorie selezionabili         |
| OHW-247 | Rinomina element da "Per progetto" → cascade su tutte le scene                                      | name update si propaga             |
| OHW-248 | Cancella (soft) element → sparisce dalle viste                                                      | `archived_at` valorizzato          |
| OHW-249 | Export PDF MM-style "Per progetto" → preview tab apre PDF                                           | usa pdfkit, non afterwriting       |
| OHW-250 | Export CSV "Per progetto" → download file `breakdown-{slug}-{date}.csv`                             | UTF-8, RFC 4180                    |

### Stale awareness

| ID      | Titolo                                                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OHW-251 | Apri ScreenplayEditor: solo le scene con breakdown **stale** mostrano badge `⚠` passivo accanto al heading; click → naviga a breakdown. Scene con breakdown non-stale e scene senza breakdown: nessun badge |
| OHW-252 | Modifica scena → crea nuova versione → apri breakdown nuova versione → banner L3 visibile con count                                                                                                         |
| OHW-253 | Apri breakdown su scena con hash diverso (modifica testo nel mock) → re-match runtime → occurrence non più trovata appare dimmed + barrata + tooltip "non trovato nel testo"                                |

### Permessi

| ID      | Titolo                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------- |
| OHW-254 | Viewer accede a /breakdown → vista in read-only: niente "+", niente "✨ Cesare", niente menu "Tagga come" |
| OHW-255 | Owner/Editor full CRUD su elements + occurrences                                                          |
| OHW-256 | Non-membro accede a /breakdown → 403                                                                      |

### Cesare

| ID      | Titolo                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| OHW-257 | MOCK_AI=true: ritorno canned deterministico per fixture "scene-warehouse-12" (8 suggestions)                                      |
| OHW-258 | "✨ Suggerisci scena" su scena già breakdown-ata: nuovi candidati appaiono come pending; accepted/ignored esistenti immutati      |
| OHW-259 | "✨ Suggerisci tutto lo script": rate-limit max 1/5min per progetto; secondo click entro 5min mostra Toast "Riprova tra X minuti" |

### Versioning

| ID      | Titolo                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| OHW-260 | Crea nuova screenplay version → modal "Importa breakdown da v{prev}?" → conferma → occurrences clonate, hash ricalcolato, isStale aggiornato     |
| OHW-261 | Crea nuova screenplay version → modal "Importa breakdown" → rifiuta → nuova versione parte con breakdown vuoto, vecchia versione conserva il suo |

## Edge cases

| Caso                                                                                      | Comportamento                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Element con quantity 0                                                                    | Vietato a livello Zod (`positive()`); UI usa toggle "rimuovi" non "quantity = 0"                                                                                                                                                                 |
| Stesso name in 2 categorie diverse (es. "Knife" come Prop e Stunt)                        | **Consentito** — 2 element distinti. Unique constraint è `(project, category, name)` non `(project, name)`                                                                                                                                       |
| Rename element → name collide con esistente nella stessa categoria                        | UI mostra prompt "Esiste già un element con questo nome — vuoi unirli?" → merge migra tutte le occurrences sull'element esistente, soft-delete il rinominato                                                                                     |
| Eliminazione scena nello screenplay                                                       | Cascade: `breakdownOccurrences` + `breakdownSceneState` della scena cancellate. Element global resta (potrebbe essere usato in altre scene). Se nessun'altra occurrence resta, l'element è "orfano" ma non viene auto-archiviato (utente decide) |
| Switch versione attiva del screenplay                                                     | Vista breakdown carica le occurrences della **versione attiva corrente**. Per vedere breakdown di altra versione: filtro versione esplicito in toolbar (post-MVP, default = active)                                                              |
| Cesare timeout / API error                                                                | Niente ghost suggestions, Toast discreto "Cesare non disponibile, riprova". Banner non appare. Lo stato precedente resta intatto                                                                                                                 |
| Cesare ritorna stessa categoria+name di element esistente con cesareStatus='ignored'      | Skip silenzioso, niente nuova occurrence pending                                                                                                                                                                                                 |
| Cesare ritorna stessa categoria+name di element esistente con occurrence accepted         | Skip silenzioso (non duplicare)                                                                                                                                                                                                                  |
| Concorrenza: due editor accettano lo stesso ghost simultaneamente                         | DB unique constraint → secondo write fallisce → client retry idempotente (recupera occurrence esistente, marca accepted)                                                                                                                         |
| Element archived ma ha occurrences                                                        | UI le nasconde nelle viste; query `getOccurrencesForScene` filtra `WHERE archived_at IS NULL`                                                                                                                                                    |
| Re-match trova `element.name` ambiguo (es. "Police" matcha "Police car" e "Police badge") | Usa word-boundary + name length tiebreaker (preferisce match più lungo)                                                                                                                                                                          |
| Hash della scena non esiste (mai fatto breakdown)                                         | Niente re-match; isStale resta false di default                                                                                                                                                                                                  |

## Test plan (sequenza TDD)

L'implementazione segue il pattern già consolidato in 04c/05j: **partire dagli E2E falliti**, poi scendere a unit/integration man mano.

### Fase A — DS atomi nuovi (TDD su component test)

1. `Tag` con varianti ghost/accepted, color tokens, icon prop
2. `Banner` con varianti `cesare`/`info`/`warning`, dismissable
3. `ContextMenu` (radix wrap o custom)
4. `DataTable` minimo (sortable, filterable, no virtualization)
5. `Badge` extend con variante `count` + `stale`

### Fase B — DB migration + domain schemas

6. Drizzle migration: 3 tabelle + indexes
7. Zod schemas in `packages/domain/src/breakdown/`
8. Branded types `ElementId`, `OccurrenceId`

### Fase C — Server fn (TDD da E2E falliti)

9. `getBreakdownForScene(sceneId, versionId)` con re-match runtime (L1)
10. `getProjectBreakdown(projectId, versionId)` per vista consolidata
11. `getStaleScenes(versionId)` per L2 badge editor
12. `addBreakdownElement` + `addOccurrence` (manuale)
13. `updateElement` (rename con cascade), `archiveElement` (soft delete)
14. `acceptOccurrence` / `ignoreOccurrence` (singolo + bulk)
15. `suggestBreakdownForScene` (Cesare, MOCK_AI in test)
16. `cloneBreakdownToVersion` (per L3)
17. `exportBreakdownPdf`, `exportBreakdownCsv`

### Fase D — UI composition

18. Route `/projects/:id/breakdown` con TanStack Router
19. Layout 3-pane (TOC + script + panel)
20. `BreakdownPanel` per scena
21. `CesareSuggestionBanner` + `CesareGhostTag`
22. `ProjectBreakdownTable` (consolidata)
23. `AddElementModal`
24. `SceneScriptViewer` selection-only + ContextMenu integration
25. `ExportBreakdownModal`
26. Editor integration: badge L2 sui scene heading

### Fase E — Cesare prompt + mock

27. System prompt + few-shot examples (cached)
28. `mocks/ai-responses.ts` deterministic outputs
29. Rate-limit per progetto (Redis o DB-backed)

## Spec References

- Permission helper: `04c-narrative-export.md` (pattern owner+editor)
- Pattern Cesare: memory `feedback-cesare-controller-pattern.md`
- Pattern componentistica: memory `feedback-design-system-driven.md`
- Versioning hook: `06-versioning.md` + `06b-universal-versioning.md`
- Locations linking (futuro): `13-locations.md`
- Budget integration (futuro): `11-budget.md`
- Schedule integration (futuro): `12-schedule.md`
- AI cost strategy: applicabile a tutto OHW
