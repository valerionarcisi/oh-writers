# Spec 10e — Auto-spoglio via RegEx (zero-click breakdown)

> **Status:** in progress
> **Depends on:** Spec 10 (Breakdown), Spec 10c (Inline scene tagging), Spec 10d (Cast tier)
> **Date:** 2026-04-22

## Goal

Quando l'utente apre la breakdown di un progetto **non deve cliccare niente** per vedere Cast, Locations, Time of Day, Vehicles, Animals, Sound, Atmosphere già popolati. La RegEx fa il 70-95% del lavoro su 7 categorie, Cesare resta per le 3 dove la RegEx fallisce (Props, Wardrobe, VFX di trama).

Trigger: ogni volta che il testo di una scena cambia (delta sul `text_hash` di `breakdown_scene_state`), si rilancia l'estrazione. Idempotente — riapplicare due volte sullo stesso testo non duplica.

## Non-goals (Spec 10e)

- Niente AI (Cesare resta separato e on-demand per Props/Wardrobe/VFX).
- Niente DOOD (Day Out of Days) — Spec 12.
- Niente budget per element — Spec 11.
- Niente OCR su PDF importati — la pipeline parte sempre dal Fountain testuale.
- Niente Italian-only: gli extractors funzionano su lemmi IT, EN convivono come fallback (v1: solo IT, EN extractor è un follow-up).

## Categorie e affidabilità target

| Categoria             | Strategia                                                       | Confidence | cesareStatus iniziale |
| --------------------- | --------------------------------------------------------------- | ---------- | --------------------- |
| `cast`                | Fountain CHARACTER (linee in CAPS)                              | ~95%       | `accepted`            |
| `locations`           | scene heading title (post-prefix)                               | ~95%       | `accepted`            |
| `vehicles`            | lemma IT (macchina, auto, camion, ...)                          | ~70%       | `pending`             |
| `animals`             | lemma IT (cane, gatto, cavallo, ...)                            | ~90%       | `accepted`            |
| `sound`               | lemma IT (campanello, urla, V.O., ...)                          | ~60%       | `pending`             |
| `atmosphere`          | lemma IT (pioggia, neve, vento, ...)                            | ~80%       | `pending`             |
| `makeup` (SFX trucco) | lemma IT (sangue, cicatrice, ferita)                            | ~70%       | `pending`             |
| `props`               | lemma IT (microfono, vassoio, bottiglia, sigaretta, ...)        | ~50%       | `pending`             |
| `wardrobe`            | — (Cesare on-demand)                                            | n/a        | n/a                   |
| `vfx`                 | — (Cesare on-demand)                                            | n/a        | n/a                   |
| `extras`              | quantità in dialog/azione (es: "una folla", "alcuni avventori") | ~50%       | `pending`             |
| `stunts`              | lemma IT (combattimento, caduta, salto, sparo)                  | ~60%       | `pending`             |
| `set_dress`           | — (manuale o Cesare)                                            | n/a        | n/a                   |
| `equipment`           | — (manuale)                                                     | n/a        | n/a                   |

`accepted` = appare come tag normale al primo apertura. `pending` = appare come ghost (utente conferma o ignora).

## Nuove categorie (questa spec aggiunge 1)

Aggiungiamo **`atmosphere`** alla `BREAKDOWN_CATEGORIES`: pioggia, neve, vento, nebbia, fumo da effetto-atmosferico (separate da `sfx` che resta per esplosioni / colpi mechanical / pyro).

Le altre categorie AD industry-standard discusse precedentemente (Eighths, Difficoltà, Music cues, Stand-ins, Permits, Child welfare, Insurance) saranno trattate in spec successivi:

- **Eighths** → già in `breakdown_scene_state.pageEighths` (campo esistente, ma non valorizzato — Spec 10f valuterà se calcolarlo da PDF rendering).
- **Difficoltà / Music cues / Permits / Child welfare** → spec dedicato (`10f-production-metadata`).
- **DOOD** → Spec 12 (Schedule).
- **Insurance** → Spec 11 (Budget).

Questa decisione la prendiamo per non gonfiare 10e oltre il chunk reviewable.

## Architecture

### Domain (`packages/domain/src/breakdown/extractors/`)

Una funzione pura per categoria. Tutte ritornano lo stesso shape:

```ts
export interface ExtractedItem {
  readonly category: BreakdownCategory;
  readonly name: string; // canonical, lowercase + initial cap (Title Case lemma)
  readonly quantity: number; // count of occurrences in scene
  readonly defaultStatus: "accepted" | "pending"; // confidence-based
  readonly source: "regex"; // future: also "cesare", "manual"
}

export type Extractor = (sceneText: string) => ExtractedItem[];
```

Files:

- `extract-cast.ts` — riconosce nomi in CAPS isolati su una riga (Fountain CHARACTER convention).
- `extract-location.ts` — split slugline `INT./EST.` ⇒ titolo location.
- `extract-vehicles.ts`, `extract-animals.ts`, `extract-sound.ts`, `extract-atmosphere.ts`, `extract-makeup.ts`, `extract-stunts.ts`, `extract-extras.ts` — ognuno ha una `LEMMA_LIST` IT con 30-80 voci e fa match case-insensitive con word-boundary.

`extract-all.ts` orchestratore puro:

```ts
export const extractAll = (sceneText: string): ExtractedItem[] => [
  ...extractCast(sceneText),
  ...extractLocation(sceneHeading), // separato perché parte dall'heading, non dal body
  ...extractVehicles(sceneText),
  ...extractAnimals(sceneText),
  ...extractSound(sceneText),
  ...extractAtmosphere(sceneText),
  ...extractMakeup(sceneText),
  ...extractStunts(sceneText),
  ...extractExtras(sceneText),
];
```

### Lemma lists

Vivono come `const` array nel modulo dell'extractor — niente file JSON esterno, niente dynamic load. Partiamo con:

- **Vehicles** (~40): macchina, auto, suv, camion, furgone, moto, scooter, bicicletta, taxi, autobus, treno, aereo, elicottero, barca, nave, gommone, scuolabus, ambulanza, polizia (auto), carro funebre, …
- **Animals** (~30): cane, gatto, cavallo, pecora, mucca, vacca, toro, capra, gallina, gallo, pollo, anatra, uccello, piccione, corvo, topo, ratto, serpente, ragno, ape, mosca, …
- **Sound** (~50): campanello, urla, applauso, risate, sparo, esplosione, V.O., O.S., (musica), (radio), squillo, telefono, …
- **Atmosphere** (~15): pioggia, neve, vento, nebbia, tuoni, lampi, fumo (atmosferico), nuvole, sole, …
- **Makeup-SFX** (~25): sangue, ferita, taglio, cicatrice, livido, contusione, lacrime, sudore, vomito, sporco di terra, …
- **Stunts** (~30): combattimento, lotta, caduta, salto, sparo, fuga, inseguimento, scontro, scivolata, …
- **Extras patterns** (~10 frasi-tipo): "una folla", "alcuni avventori", "un gruppo di", "il pubblico", "la gente", "i clienti", "i passanti", "i tifosi", …

Le liste sono intenzionalmente piccole: meglio precisione (pochi falsi positivi) che richiamo. Cesare copre la coda lunga.

### Server (`features/breakdown/server/auto-spoglio.server.ts`) — NEW

```ts
export const runAutoSpoglioForScene = createServerFn({ method: "POST" })
  .validator(z.object({ sceneId: z.string().uuid(), screenplayVersionId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ResultShape<AutoSpoglioResult, ...>> => {
    // 1. Load scene + access check
    // 2. Compute current text_hash → exit early if unchanged from last auto-run
    // 3. Run extractAll(sceneText)
    // 4. For each ExtractedItem:
    //    - upsert breakdownElement (project + category + name)
    //    - upsert breakdownOccurrence (element + version + scene) with cesareStatus = item.defaultStatus
    //    - if a manual occurrence already exists for this elementId, leave it untouched
    // 5. Update breakdownSceneState.lastAutoSpoglioRunAt
    return toShape(ok({ added, updated, skipped }));
  });
```

Integrato lato client come trigger automatico in `useEffect` del `BreakdownPage`:

- Su mount, per ogni scena della versione corrente, lancia `runAutoSpoglioForScene` se `breakdown_scene_state.lastAutoSpoglioRunAt` è null OR `text_hash` differente.
- Throttle: max 3 scene in parallelo per evitare DB hammering.
- Server-side: la funzione è no-op se hash invariato, quindi il client può chiamarla senza danni.

Aggiungi colonna `last_auto_spoglio_run_at` a `breakdown_scene_state` (migration `0010_add_auto_spoglio_state.sql`).

### Schema delta

```sql
ALTER TABLE breakdown_scene_state
  ADD COLUMN last_auto_spoglio_run_at timestamp;
```

E nuova categoria `atmosphere`:

```ts
// packages/db/src/schema/breakdown.ts
export const BREAKDOWN_CATEGORIES = [
  ...,
  "atmosphere",  // NEW
] as const;
```

CHECK constraint sul DB esiste come enum drizzle, basta aggiornare la lista in domain + db schema; nessuna migration SQL serve perché `category` è `text` non un PG enum.

### UI

**`BreakdownPanel.tsx`**

- Aggiungi `atmosphere` alla `CATEGORY_META` (icon `ATM`, color token `--cat-atmosphere`).
- Mostra l'origine dell'occurrence con un pallino piccolissimo nel Tag: 🟢 = manuale, ⚙️ = regex, ✨ = cesare. (Opzionale per v1; il `cesareStatus = pending` già visibile come ghost copre l'80% del bisogno.)

**`BreakdownPage.tsx`**

- All'arrivo, useEffect → `runAutoSpoglioForVersion(versionId)` (server function "fan-out" che internamente chiama `runAutoSpoglioForScene` per ogni scena con hash stale).
- Banner non-bloccante in alto durante il run: "Auto-spoglio in corso… (3/12 scene)" con `<Skeleton>` come progress.

## Tests

### Unit (Vitest)

Un file di test per ogni extractor in `packages/domain/src/breakdown/extractors/`:

- `extract-cast.test.ts`
  - "FILIPPO\nbla bla" → Filippo (qty 1)
  - 3 occurrences di FILIPPO in scena → Filippo (qty 3)
  - Riga "OPEN GREZZO" preceduta da heading: NOT a character (è location)
  - Parenthetical "(V.O.)" attaccato al nome: tagliato, "JOHN (V.O.)" → John
- `extract-location.test.ts`
  - "INT. CUCINA - NOTTE" → Cucina
  - "INT/EXT. ANGOLO OPEN GREZZO/FUORI DALLA PORTA - NOTTE" → "Angolo Open Grezzo / Fuori Dalla Porta"
- `extract-vehicles.test.ts`
  - "una macchina passa" → Macchina
  - "macchine sulla strada" (plurale) → Macchina (qty 1, lemmatizzato)
  - "una sola scarpa" → nessun match (no fp con "scarpa")
- Idem per animals/sound/atmosphere/makeup/stunts/extras.

E un test orchestrator:

- `extract-all.test.ts` — sulla scena 1 di "Non fa ridere" verifica che ritorni almeno: Filippo, John, Pubblico, Tea (cast); Open Grezzo (location); Macchina (vehicle); applauso, risate, V.O. (sound); 1 extras pattern.

### Server (Vitest)

- `auto-spoglio.server.test.ts`
  - Run su scena → crea N elements + N occurrences con cesareStatus corretto.
  - Run secondo (stesso testo) → no-op (added=0, updated=0, skipped=N).
  - Run dopo edit del testo → updated/added rispetta il delta.
  - Manual element esistente → NON sovrascritto.

### E2E (Playwright)

`tests/breakdown/auto-spoglio.spec.ts`:

- `[OHW-320]` Apri breakdown del seed project per la prima volta → entro 5s vedi tag accepted "Filippo", "John" e ghost "Macchina" senza aver cliccato Suggerisci.
- `[OHW-321]` Modifica testo scena 1 (rimuovi tutte le menzioni di Filippo) → il tag "Filippo" diventa stale (non viene rimosso, è pattern Spec 10).
- `[OHW-322]` Banner progress visibile durante il primo auto-spoglio.

## Migration & rollout

- Migration `0010_add_auto_spoglio_state.sql` non distruttiva.
- Aggiunta categoria `atmosphere` non breaking (text column).
- Backfill: al deploy, per ogni progetto esistente, opzionalmente lanciare un job di auto-spoglio. v1: lazy on first open.

## Lessons learned (post-ship)

- `seedScenesFromFountain` originariamente popolava solo l'heading (`scene.notes = null`). Risultato: gli extractors body-based (cast, vehicles, sound, …) non avevano testo da analizzare e l'utente vedeva solo le `locations` (extractor heading-based). Fix: la seed ora fa due passi — indicizza tutti gli heading line, poi per ognuno slice il body fra heading[i]+1 e heading[i+1] e lo salva in `scene.notes`. Su "Non fa ridere" scena 1 questo passa da 2 occurrences a 15 (cast 7 + locations 2 + sound 3 + extras 1 + vehicles 1 + animals 1).
- Lezione architetturale: in produzione `scene.notes` viene riempito al save dell'editor (ProseMirror → DB scene rows), ma c'è ancora rischio di dropout se la pipeline editor→scene-row si rompe. Spec 10g (futuro) potrebbe valutare se l'auto-spoglio debba leggere direttamente dal `pmDoc` della versione invece che da `scene.notes`, eliminando la dipendenza da quella materializzazione.
- Migration mancante in DB locale (`0010_add_auto_spoglio_state.sql`) ha causato 500 silenti su `getBreakdownForScene/loadState` perché il select includeva `lastAutoSpoglioRunAt`. Lezione operativa: aggiungere check di `pnpm db:migrate` allo script `dev:reset` o a un `predev` hook, così un nuovo dev non incappa nello stesso problema.
- **`props` ripristinato come extractor regex**. Era originariamente "Cesare on-demand" perché ritenuto creativity-heavy, ma in pratica un AD logga oggetti fisici concreti (microfono, vassoio, bottiglia, sigaretta, scopa, …) che SONO regex-extractable con una lemma list narrow + `pending` di default. La curatela è in `extract-props.ts` (~30 lemmi) e Cesare resta per la coda lunga. Su "Non fa ridere" produce ~25 ghosts in 7 scene.
- **Falsi positivi cast su transitions**. `extract-cast.ts` trattava qualsiasi linea CAPS preceduta da blank come CHARACTER cue, includendo "FADE OUT.", "THE END.", "CUT TO:", "DISSOLVENZA." Visibile su sceneggiature inglesi che terminano con `FADE OUT.` → l'AD si trovava un personaggio chiamato "Fade Out." nel cast. Fix: blacklist bilingua di transitions/end markers + regex `\sTO:$` per coprire `MATCH CUT TO:`/`SMASH CUT TO:` ecc. Coperto da unit test + E2E `OHW-324`.
- **Cast/Locations/V.O. funzionano già su EN**. Verificato manualmente su `clean-short.fountain` (EN): cast (Elena), locations (Old House — Foyer/Kitchen/…) e Voice Over via `(V.O.)` vengono estratti senza modifiche, perché i pattern sono language-agnostic. Tutti gli extractor a lemma IT (props, vehicles, animals, atmosphere, makeup, stunts, extras) restituiscono 0 su EN — comportamento atteso, da risolvere quando arriverà la v2 EN extractors.

## Out of scope

- EN extractors (lemma IT only in v1).
- Lemmatizzazione morfologica complessa (uso `\b(macchin\w*|auto|...)\b` semplice).
- ML / embeddings (zero dipendenze nuove).
- Override per-progetto delle lemma lists (futuro: Settings → "vocabolario di progetto").
- Detect dei dialoghi vs azione per migliorare la precisione (futuro).

## Prerequisites

- `[EXISTING DS]` `Banner`, `Skeleton`, `Tag`.
- Nessun nuovo atomo DS.
