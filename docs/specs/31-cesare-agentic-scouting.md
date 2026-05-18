# Spec 31 — Cesare: Location Scouting Agente

## Overview

Cesare guadagna la capacità di **cercare location reali** e **creare candidati nel
database** in risposta a messaggi in linguaggio naturale dell'utente.

Invece di rispondere "non ho accesso a internet", Cesare esegue tool calls verso
Google Places API, costruisce candidati con coordinate, nome e indirizzo, li
persiste in `locationCandidates`, e li commenta in relazione al requisito narrativo
della scena. I candidati appaiono sulla mappa mentre Cesare sta ancora scrivendo.

Dipendenze:
- Spec 13 (Locations) — schema `locationRequirements`, `locationCandidates`
- Spec 17 (Cesare UI) — sheet, streaming, page context
- Spec 29 (Cesare UI attuale) — `CesarePage`, `requirementId`, markdown renderer

---

## User Story

> Clicco "✦ Cesare" su un requisito "LOCALE DI PAESE — INT/EXT — GIORNO".
> Il sheet si apre con context chip "LOCALE DI PAESE". Scrivo: "trova locali
> autentici a Piane di Falerone". Cesare risponde in streaming:
>
> _"Cerco su Google Places locali nella zona…"_  
> _"Trovato: Trattoria Da Bruno, Via Roma 12 — aggiunto alla mappa."_  
> _"Trovato: Bar Sport Centrale, Piazza del Comune — aggiunto."_  
> _"Trovato: Osteria Il Forno Vecchio, Contrada Montagna — aggiunto."_  
> _"Tre candidati aggiunti. Il terzo è fuori dal centro, più autentico e meno
> trafficato — si adatta meglio a una scena privata. Ti consiglio di visitarlo
> per primo."_
>
> Mentre leggo la risposta, i tre pin compaiono sulla mappa in tempo reale.

---

## Architettura

### Flusso generale

```
User message → askCesare (server fn)
  → assembleContext (già esistente)
  → callCesareWithTools (nuovo)
      → Anthropic messages.create with tools
      → tool_use: search_places → executeSearchPlaces → Google Places API
      → tool_use: add_candidate → executeAddCandidate → DB insert
      → tool_result → continue stream
  → risposta testuale finale
  → toShape → CesareSheet
```

### SSE streaming esteso

Il server fn oggi raccoglie tutto e restituisce una stringa. Per l'UX agente
serve streaming progressivo. Implementazione:

1. `askCesare` diventa `askCesareStream` — endpoint HTTP raw (non server fn)
   che scrive chunk SSE sulla risposta.
2. Il client apre `EventSource` o `fetch` con reader per ricevere i chunk.
3. Il `CesareSheet` aggiorna il bubble in tempo reale, inclusi i messaggi di
   tool progress.

Alternativa semplificata (prima iterazione): **polling / round-trip** —
il server esegue l'intero loop tools sincrono e restituisce la stringa finale
come oggi. I candidati vengono creati server-side; la mappa si aggiorna tramite
TanStack Query invalidation al ritorno della risposta. Meno "live" ma implementabile
senza riscrivere il transport layer.

**Scelta per questa spec: round-trip prima, SSE in seguito (spec 31b).**

---

## Tool Definitions

### `search_places`

Cerca luoghi reali tramite Google Places API Text Search.

```typescript
const searchPlacesTool: Tool = {
  name: "search_places",
  description:
    "Cerca luoghi reali (locali, edifici, parchi, strade, etc.) tramite Google Places. " +
    "Usa questo tool quando l'utente chiede di trovare location fisiche in una zona.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Query di ricerca, es. 'trattoria Piane di Falerone' o 'edificio industriale Torino'",
      },
      location_bias: {
        type: "string",
        description: "Città o zona geografica per restringere la ricerca, es. 'Piane di Falerone, FM'",
      },
      max_results: {
        type: "number",
        description: "Numero massimo di risultati (default 5, max 10)",
      },
    },
    required: ["query"],
  },
};
```

Risposta del tool verso Anthropic:

```typescript
interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_id: string;
  rating?: number;
  types: string[];
}
```

### `add_candidate`

Crea un `locationCandidate` nel database.

```typescript
const addCandidateTool: Tool = {
  name: "add_candidate",
  description:
    "Aggiunge un candidato reale alla location requirement corrente. " +
    "Usa questo tool dopo search_places per salvare i risultati rilevanti.",
  input_schema: {
    type: "object",
    properties: {
      requirement_id: {
        type: "string",
        description: "UUID del location requirement a cui aggiungere il candidato",
      },
      name: { type: "string", description: "Nome del luogo" },
      address: { type: "string", description: "Indirizzo completo" },
      lat: { type: "number", description: "Latitudine" },
      lng: { type: "number", description: "Longitudine" },
      notes: {
        type: "string",
        description: "Note sintetiche su perché questo candidato è rilevante per la scena",
      },
    },
    required: ["requirement_id", "name"],
  },
};
```

### `reject_candidate`

Marca un candidato esistente come `rejected` con motivazione.

```typescript
const rejectCandidateTool: Tool = {
  name: "reject_candidate",
  description:
    "Marca un candidato esistente come rifiutato, con motivazione.",
  input_schema: {
    type: "object",
    properties: {
      candidate_id: { type: "string" },
      reason: { type: "string" },
    },
    required: ["candidate_id", "reason"],
  },
};
```

---

## Google Places Integration

### API scelta: Places API (New) — Text Search

Endpoint: `POST https://places.googleapis.com/v1/places:searchText`

Header: `X-Goog-Api-Key`, `X-Goog-FieldMask`

Field mask minima:
```
places.displayName,places.formattedAddress,places.location,places.id,places.rating,places.types
```

Costo: $0.017 per request (Text Search). Con max 5 tool calls per conversazione
il costo per sessione è < $0.10.

### Env var

```
GOOGLE_PLACES_API_KEY=...
```

Server-side only. Mai esposta al client.

### Graceful fallback

Se `GOOGLE_PLACES_API_KEY` non è configurata, il tool `search_places` restituisce
un errore strutturato che Cesare trasforma in risposta utente:
_"Non ho accesso a Google Places in questo ambiente. Posso aiutarti a strutturare
la ricerca che farai manualmente."_

---

## Implementazione server-side

### `cesare-tools.ts` (nuovo file)

```
apps/web/app/features/predictions/cesare-tools.ts
```

Contiene:
- `CESARE_TOOLS` — array delle Tool definitions Anthropic
- `executeSearchPlaces(input, apiKey)` → `ResultAsync<PlaceResult[], CesareError>`
- `executeAddCandidate(input, db, projectId)` → `ResultAsync<{id: string}, CesareError>`
- `executeRejectCandidate(input, db)` → `ResultAsync<void, CesareError>`
- `runToolLoop(client, systemPrompt, messages, db, projectId)` → `ResultAsync<string, CesareError>`

### Tool loop in `cesare.server.ts`

Sostituisce `callCesare` con `callCesareWithTools` quando il page context è
`"locations"` (dove i tool sono utili). Gli altri contesti continuano a usare
il flusso senza tool per semplicità e costo.

```typescript
const callCesareWithTools = (
  systemPrompt: string,
  history: ConversationMessage[],
  message: string,
  db: Db,
  projectId: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    runToolLoop(client, systemPrompt, buildMessages(history, message), db, projectId),
    (e) => new CesareError(String(e)),
  );
```

Il loop:
1. Chiama `messages.create` con `tools: CESARE_TOOLS`
2. Se `stop_reason === "tool_use"` → esegue ogni tool block → appende `tool_result`
3. Ricall fino a `stop_reason === "end_turn"` o max 5 iterazioni
4. Raccoglie tutto il testo dalle risposte `text` block
5. Tra una iterazione e l'altra, prefissa il testo progressivo con messaggi
   di stato ("Cerco su Google Places…", "Trovato: X — aggiungo alla mappa")

---

## Aggiornamento mappa real-time (round-trip)

Con l'approccio round-trip (prima iterazione):

1. `askCesare` completa l'intero loop e restituisce la stringa finale
2. `CesareSheet` chiama `queryClient.invalidateQueries({ queryKey: ["locations", projectId] })`
   al termine della risposta
3. La mappa ricarica i candidati e mostra i nuovi pin

Questo è già sufficiente per la UX: l'utente legge la risposta di Cesare (che
menziona i candidati) e vede la mappa aggiornarsi subito dopo.

---

## UX nel CesareSheet

### Tool progress nel bubble

Durante il tool loop (iterazioni successive), il testo intermedio viene
concatenato nella risposta finale con separatori visivi:

```
Cerco su Google Places "trattoria Piane di Falerone"…

Trovato: Trattoria Da Bruno — aggiunto.
Trovato: Bar Sport Centrale — aggiunto.
Trovato: Osteria Il Forno Vecchio — aggiunto.

---

Tre candidati aggiunti alla mappa. Il terzo è in una contrada più isolata —
meno rumore di fondo, luce più controllabile. Ti consiglio di iniziare da lì.
```

Il markdown renderer esistente gestisce già `---` e paragrafi.

### Indicatore "ricerca in corso"

Quando l'utente invia un messaggio nel contesto locations, il bubble di loading
mostra "Ricerca location…" invece dei punti standard. Implementato cambiando
il placeholder text in `CesareSheet.tsx` basandosi su `currentPage`.

---

## Schema DB — nessuna modifica

`locationCandidates` già ha tutti i campi necessari:
- `name`, `address`, `coordinates` (lat/lng)
- `notes`, `status`, `aiSuggested`

`aiSuggested: true` viene impostato su tutti i candidati creati da Cesare.

---

## Sicurezza

- `executeAddCandidate` verifica che il `requirementId` appartenga al `projectId`
  dell'utente autenticato (join con `locationRequirements.projectId`).
- `executeRejectCandidate` verifica stessa ownership.
- Mai eseguire tool che modificano dati senza ownership check.
- `GOOGLE_PLACES_API_KEY` solo server-side.

---

## Tests

### Vitest (unit)

**File:** `apps/web/app/features/predictions/cesare-tools.test.ts`

- `[OHW-501]` `executeSearchPlaces` con API key mancante → ritorna `CesareError`
- `[OHW-502]` `executeAddCandidate` con `requirementId` di altro progetto → ritorna `CesareError`
- `[OHW-503]` `runToolLoop` max 5 iterazioni → non va in loop infinito
- `[OHW-504]` mock Google Places response → candidati creati correttamente nel DB

### Playwright (E2E)

**File:** `tests/locations/cesare-scouting.spec.ts`

- `[OHW-505]` Apri Cesare su requirement, scrivi "trova ristoranti a Roma" con
  `MOCK_AI=true` → risposta mock, nessuna call reale, candidati non creati (mock
  non crea candidati)
- `[OHW-506]` Con `MOCK_AI=false` e `GOOGLE_PLACES_API_KEY` configurata in test
  env → candidati appaiono sulla mappa dopo risposta

---

## Rollout

1. `cesare-tools.ts` — tool definitions + Google Places client + DB executors
2. `cesare.server.ts` — integra `callCesareWithTools` per page `"locations"`
3. `CesareSheet.tsx` — invalidate query dopo risposta + loading label "locations"
4. Env var `GOOGLE_PLACES_API_KEY` in `.env.local` e Netlify env
5. Test Vitest
6. Test Playwright su ephemeral con `GOOGLE_PLACES_API_KEY` reale

**Non in scope (spec 31b):** SSE streaming progressivo mid-response.
