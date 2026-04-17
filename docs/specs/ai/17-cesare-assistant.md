# Spec 17 — Cesare, assistente AI universale

Sostituisce la versione precedente di questa spec ("Story Doctor"). Introduce
**Cesare**, l'assistente AI di Oh Writers — un secondo paio di occhi che legge
quello che il writer sta scrivendo e lascia annotazioni inline ancorate
all'elemento del DOM, con popover contestuali ed azioni eseguibili.

Cesare opera in tre contesti (logline, scaletta, sceneggiatura) con la stessa UX
e lo stesso pattern di interazione. Cambiano solo il prompt, le categorie di
analisi e la tecnica di rendering dei marker.

---

## Context

Oh Writers oggi è uno strumento di scrittura che non parla. Il writer scrive,
salva, versiona — ma non riceve feedback strutturato. Le specifiche AI
precedenti (07, 14) propongono generazioni one-shot (logline auto-generata,
sinossi auto-generata) che producono testo nuovo. Cesare è diverso: non genera,
**legge e commenta** quello che il writer ha già scritto.

Il principio di prodotto: **UX liquida**. Cesare non apre drawer o pannelli
laterali. Ancora le sue osservazioni direttamente all'elemento del DOM che le
riguarda. Il writer continua a guardare quello che stava guardando — il
feedback compare lì sopra, non altrove.

Dipendenze:

- Spec 04 (NarrativeEditor) — per il contesto logline
- Spec 15 (Timeline scaletta) — per il contesto outline
- Spec 05+ (ScreenplayEditor con ProseMirror) — per il contesto sceneggiatura
- Spec 12 (VersionsDrawer) — per la creazione automatica di versioni prima
  delle modifiche eseguibili

Esclusioni esplicite:

- Cesare non è un chatbot (no testo libero in input)
- Cesare non è un autocompletamento real-time (no analisi mentre scrivi)
- Cesare non è una modal o un drawer (no overlay laterali fissi)

---

## User Story

> Sto scrivendo la scaletta del mio film. Ho 24 scene divise in 3 atti. Mi
> sembra che il secondo atto perda ritmo, ma non sono sicuro. Clicco
> **`✦ Chiedi a Cesare`** nella toolbar. Per 5 secondi vedo che Cesare sta
> leggendo. Poi sulla timeline compaiono dei segni: la scena 4 ha un bordo
> giallo a sinistra, la scena 7 un bordo rosso, l'atto II un alone diffuso.
> Una status bar in basso mi dice "3 critici, 5 attenzioni, 2 spunti".
>
> Faccio hover sulla scena 7. Si apre un popover ancorato alla card:
> _"Tre scene di esposizione di fila. Il flusso si appiattisce dopo
> l'incidente scatenante."_ Sotto: tre azioni — _Sposta dopo II atto_,
> _Ignora_, _Suggerisci riscrittura_.
>
> Clicco "Sposta dopo II atto". La card scivola visivamente nella nuova
> posizione, il marker scompare, in basso compare un toast: _"Cesare ha
> spostato la scena 7 — Annulla"_. Cliccando "Vai al prossimo" nella status
> bar scrollo al marker successivo.

---

## Behaviour

### Trigger

In ogni editor con scope Cesare attivo (logline, outline, screenplay) la
toolbar mostra il bottone:

```
✦ Chiedi a Cesare
```

Il bottone vive nella toolbar primaria dell'editor — stessa visibilità del
bottone Versioni. Il glifo `✦` è la firma visiva di Cesare e ricorre in tutti
i suoi marker e popover.

**Stati del bottone:**

- **Idle**: `✦ Chiedi a Cesare` — Cesare non è mai stato chiamato in questa
  sessione per questo documento
- **Pending**: spinner inline + label `✦ Sta leggendo…` — chiamata AI in corso
- **Active con report fresco**: `✦ Cesare · 3 critici · 5 attenzioni · 2 spunti`
  — il report è valido e i marker sono visibili
- **Active con report stantio**: `✦ Cesare · report stantio` — il documento
  è stato modificato dopo l'ultimo consulto, il bottone ha un'icona `⚠`
- **Errore**: `✦ Cesare · errore` — l'ultima chiamata è fallita

Click sul bottone:

- Da idle/errore → invoca `analyzeWithCesare` (vedi Server)
- Da active fresh → toggle off (rimuove tutti i marker e la status bar)
- Da active stale → invoca di nuovo `analyzeWithCesare`

### Loading state

Durante l'analisi (5–8 sec tipici):

1. Il bottone toolbar mostra `✦ Sta leggendo…` con spinner
2. La status bar in basso (vedi più sotto) compare già in modalità skeleton:
   `✦ Cesare sta leggendo la scaletta…`
3. Nessun marker ancora sul contenuto — il writer continua a poter editare

Se l'editor cambia durante il loading, l'analisi continua sul snapshot
catturato all'inizio. Quando i finding arrivano, vengono ancorati per ID
(sceneId, characterRange, ecc.) — se l'elemento target non esiste più
(scena cancellata), il finding viene scartato silenziosamente.

### Marker inline — rendering specifico per contesto

Ogni finding produce un marker visivo ancorato a un elemento del DOM. La
tecnica varia per contesto, ma l'**estetica è identica**: un'indicazione di
severità (border-inline-start colorato), il glifo `✦` in piccolo, e
interazione hover/click per il popover.

#### Logline (`<textarea>` in NarrativeEditor)

Tecnica: layer overlay trasparente sopra il textarea che renderizza wavy
underline solo sui range marcati. Pattern Grammarly. Implementato come
componente `<MarkerOverlay>` che riceve `markers: Array<{start, end, severity}>`
e calcola le coordinate via misurazione del DOM (range API + line height).

```
Una detective ~~~~burned-out~~~~ deve risolvere il caso del~~~~suo mentore~~~~…
                  ^^^^^^^^^^^^^^                              ^^^^^^^^^^^^^^^^^
                  marker info                                  marker warning
```

Il layer si riposiziona al resize/scroll/typing del textarea (osservato via
`ResizeObserver` + listener input).

#### Scaletta (cards React in OutlineTimeline)

Tecnica: ogni card scena riceve attributi `data-cesare-severity`,
`data-cesare-finding-id`. CSS reagisce con:

- Border inline-start colorato (`--color-error` / `--color-warning` /
  `--color-info`) di `4px`
- Glyph `✦` posizionato in alto a destra della card che fade-in con un'ombra
  morbida
- Sottile alone (`box-shadow` con colore severità a bassa opacità) per i
  critici

Per i finding che riguardano un atto intero (non una singola scena), il
gruppo atto riceve un alone diffuso analogo applicato al `<TimelineGroup>`.

#### Sceneggiatura (ProseMirror in ScreenplayEditor)

Tecnica: ProseMirror `DecorationSet` plugin che applica decoration inline ai
range testuali coinvolti. Wavy underline (CSS `text-decoration:
wavy underline var(--color-warning)`) per attenzioni e spunti, sfondo tenue
(`background: rgba(var(--color-error-rgb), 0.08)`) per critici. Il glifo `✦`
appare come widget decoration al margine sinistro della linea coinvolta.

Il `DecorationSet` è gestito da un plugin dedicato `cesarePlugin` che
risponde a transazioni dell'editor: quando un range marcato viene modificato,
il marker viene rimosso (il finding non è più valido finché non si
rianalizza).

### Popover contestuale

Hover di 400ms o click su un elemento marcato apre il `CesarePopover`. Un
solo componente, riusato in tutti e tre i contesti. Anchor: l'elemento
marcato. Posizionamento: floating-ui auto-placement (preferenza top, poi
right, poi bottom).

Anatomia:

```
┌───────────────────────────────────────────┐
│ ✦  Cesare · Ritmo                    ●    │
│                                           │
│ Tre scene di esposizione di fila. Il      │
│ flusso si appiattisce dopo l'incidente    │
│ scatenante.                               │
│                                           │
│ ↳ Riguarda: Scene 4, 5, 6                │
│                                           │
│ ── Possibile mossa ──                    │
│ Spostare la scena 6 dopo l'inizio del    │
│ II atto, oppure trasformare la 5 in un    │
│ confronto attivo.                         │
│                                           │
│ [Sposta dopo II atto]  [Suggerisci ✎]   │
│ [Ignora questo]                           │
└───────────────────────────────────────────┘
```

**Sezioni:**

1. Header: glifo `✦`, nome `Cesare`, categoria, pallino severità
2. Diagnosi (1–2 frasi)
3. Ancora: scene/range coinvolti
4. Possibile mossa (sezione opzionale, omessa se l'AI non ha suggerimento concreto)
5. Azioni eseguibili (massimo 3, vedi sezione Azioni)

**Comportamento:**

- Esc o click outside chiude il popover
- Click su un'azione esegue immediatamente (con animazione + toast undo)
- Tab e shift+tab navigano tra le azioni
- Se il popover si apre per hover, click su un'azione lo "pinga" (resta aperto
  fino a click outside esplicito)

### Azioni eseguibili

Cesare può proporre tre tipi di azione, sempre in fondo al popover:

#### Distruttive (modificano il documento)

Esempi: _Sposta dopo II atto_, _Unisci con scena precedente_, _Rimuovi questo
passaggio_, _Ammorbidisci tono_.

Comportamento:

1. Click → log dell'azione + chiamata server
2. **Versione automatica creata PRIMA della modifica** (vincolo invariante —
   creata con label `Prima dell'azione di Cesare: <descrizione azione>`)
3. La modifica avviene visivamente in place (animazione 300–500ms)
4. Marker rimosso
5. Toast in basso: `Cesare ha [azione]. [Annulla]`
6. "Annulla" disponibile per 10 sec → ripristina la versione pre-modifica

#### Suggerimenti (mostrano una proposta senza applicarla)

Esempi: _Suggerisci riscrittura_, _Mostra alternative_.

Comportamento:

1. Click → seconda chiamata AI con prompt specifico per la proposta
2. Il popover si espande mostrando la proposta come testo non applicato,
   con bottoni `Applica` / `Scarta`
3. `Applica` segue il flusso distruttivo (versione automatica + animazione)

#### Non-distruttive

Esempi: _Ignora questo_, _Vai alla scena coinvolta_, _Spiega meglio_.

Comportamento immediato senza versioning. _Ignora_ nasconde il marker per
la sessione corrente (vedi Persistenza dismiss).

### Status bar

Quando Cesare è attivo (almeno un finding visibile), una status bar appare
ancorata al **footer dell'area editoriale** (non al viewport — non blocca
contenuto, scrolla con la pagina).

```
┌────────────────────────────────────────────────────────────┐
│ ✦ 3 critici · 5 attenzioni · 2 spunti                      │
│                                                            │
│ ◀ precedente   Vai al prossimo ▶   [Rianalizza]  [Chiudi] │
└────────────────────────────────────────────────────────────┘
```

Comportamento:

- Conteggi cliccabili: filtrano i marker visibili (es. click su "5
  attenzioni" → mostra solo i marker di severità `warning`)
- `Vai al prossimo ▶` → smooth scroll al marker successivo (in document
  order) + halo pulsante 2.5 sec sull'elemento. Esce dalla viewport rotation
  alla fine, riparte dall'inizio
- `Rianalizza` → invoca di nuovo `analyzeWithCesare`. I dismiss matching
  vengono conservati (vedi Persistenza dismiss)
- `Chiudi` → rimuove tutti i marker, status bar e popover. Il bottone
  toolbar torna a stato idle

La status bar rispetta `prefers-reduced-motion`: niente slide-in animato.

### Halo di navigazione

Quando il writer naviga a un marker (via `Vai al prossimo` o click su una
scena coinvolta dal popover), l'elemento riceve un halo CSS pure animato:

```css
@keyframes cesareHalo {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--color-accent-rgb), 0.5);
  }
  50% {
    box-shadow: 0 0 0 12px rgba(var(--color-accent-rgb), 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(var(--color-accent-rgb), 0);
  }
}
```

Durata 2.5 sec, infinite: false, una sola pulsazione. Respect
`prefers-reduced-motion: reduce` → nessuna animazione, solo un breve
background flash di 300ms.

### Reattività al DOM

Cesare deve essere "vivo" rispetto al contenuto. Tre regole:

1. **Edit di un elemento marcato**: il marker si dissolve immediatamente
   (fade-out 200ms). Il finding viene marcato come `staleByEdit` e non torna
   nemmeno se l'utente annulla l'edit. Il bottone toolbar passa a stato
   `report stantio` (anche se altri finding sono ancora validi)
2. **Drag di una scena marcata** (in OutlineTimeline): il marker la segue
   visivamente. Lo `data-cesare-severity` resta sulla card. La status bar
   non cambia
3. **Cancellazione di un elemento marcato**: marker rimosso, contatore
   status bar decrementato, finding scartato

Implementazione: ogni marker è ancorato a un ID stabile (sceneId,
characterId per i range PM, ecc.). Un effect React/PM observer reagisce ai
cambi del documento e aggiorna la `markerStore`.

### Persistenza dismiss

Quando l'utente clicca _Ignora questo_:

- Il marker scompare immediatamente
- Il counter si decrementa
- Toast in basso: `Cesare ignorerà questa osservazione. [Annulla]` (5 sec)
- Persistenza in `localStorage` con chiave
  `oh-writers:cesare-dismissed:{documentId}` come array di hash:
  `sha1(category + diagnosi + anchorId)`

Al re-run di Cesare (`Rianalizza`), i finding il cui hash combacia con un
dismiss persistito vengono **filtrati prima del rendering** — il counter li
esclude. L'utente può forzare il reset via menu `⋯` della status bar:
`Mostra osservazioni ignorate`.

### Stati "vuoti"

#### Nessun finding (Cesare non ha trovato problemi)

La status bar appare con messaggio:

```
✦ Cesare · Nessuna osservazione critica.
[Riascolta tra qualche modifica]   [Chiudi]
```

Nessun marker sul contenuto. Conferma esplicita di esito positivo — il writer
deve sapere che l'analisi è stata fatta.

#### Errore

Toast in alto a destra: `✦ Cesare non ha potuto leggere il documento.
[Riprova]`

Nessun cambio nello stato dell'editor. Bottone toolbar torna a stato
`errore`.

### Coesistenza con altri layer di annotazione

In OutlineTimeline esistono già i `comments` del writer (spec 15) — annotazioni
proprie ancorate a scene. Cesare aggiunge un secondo layer. Per evitare
confusione visiva:

- Comments writer → icona `💬` colorata + pallino badge sull'angolo della card
- Suggerimenti Cesare → border-inline-start + glifo `✦`

Mai mescolare le due affordance. Mai sovrapporre la posizione del badge.
La card scena può portare entrambe le decorazioni contemporaneamente.

In sceneggiatura, lo stesso vale per i (futuri) note inline del writer e i
marker di Cesare.

---

## Scope-specific behaviour

### Logline scope

- Categorie analizzate: chiarezza, stakes, originalità, promessa di genere,
  lunghezza, tono
- Numero atteso di finding: 1–3 (raramente 4–5)
- Nessun raggruppamento — i finding sono sempre singoli
- Marker su range testuali (parole o frasi)
- Azioni tipiche: `Suggerisci riscrittura`, `Mostra alternative`, `Ignora`
- Nessuna azione "sposta" o "unisci" — non hanno senso per la logline

### Outline scope

- Categorie analizzate: ritmo, turning point, personaggi, equilibrio atti,
  ridondanze
- Numero atteso di finding: 5–15
- Possibile raggruppamento per categoria nella status bar (`Per categoria ▾`)
- Marker su singole scene o sull'intero atto
- Azioni tipiche: `Sposta dopo X`, `Unisci con precedente`, `Suggerisci
riscrittura description`, `Suggerisci scena ponte`, `Ignora`

### Screenplay scope

- Categorie analizzate: voce personaggi, show vs tell, densità descrittiva,
  continuità geografica, pacing pagina, sottotesto vs testo
- Numero atteso di finding: potenzialmente 30+
- **Threshold di visibilità**: di default mostra solo i critici. Toggle in
  status bar per mostrare attenzioni e spunti. Se più di 10 marker sono
  visibili sulla stessa pagina, raggrupparli in un unico marker `✦ +N`
  espandibile
- Marker su range testuali (ProseMirror decorations)
- Azioni tipiche: `Suggerisci riscrittura passaggio`, `Suggerisci taglio`,
  `Mostra dialoghi precedenti del personaggio`, `Ignora`

---

## Server Architecture

### File: `apps/web/app/features/predictions/server/cesare.server.ts`

```ts
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync } from "neverthrow";
import { requireUser } from "~/server/context";
import { toShape } from "@oh-writers/utils";

const CesareScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("logline"),
    documentId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("outline"),
    documentId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("screenplay"),
    screenplayId: z.string().uuid(),
  }),
]);

export const analyzeWithCesare = createServerFn({ method: "POST" })
  .validator(z.object({ scope: CesareScopeSchema }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        CesareReport,
        AiUnavailableError | DocumentEmptyError | ForbiddenError | DbError
      >
    > => {
      await requireUser();
      return toShape(
        loadContentForScope(data.scope)
          .andThen(buildPrompt)
          .andThen(callCesareAI)
          .andThen(parseAndValidateResponse),
      );
    },
  );
```

### File: `apps/web/app/features/predictions/server/cesare-action.server.ts`

```ts
export const executeCesareAction = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scope: CesareScopeSchema,
      findingId: z.string().uuid(),
      actionId: z.string(), // e.g. "moveSceneAfterAct"
      payload: z.record(z.unknown()),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { versionId: string; updatedContent: unknown },
        AiActionFailedError | ForbiddenError | DbError
      >
    > => {
      await requireUser();
      // 1. Crea automaticamente una versione (drawer.createManualVersion via scope)
      // 2. Applica la modifica al documento
      // 3. Restituisce versionId per l'undo + nuovo contenuto
      return toShape(
        createPreActionVersion(
          data.scope,
          `Prima dell'azione di Cesare: ${data.actionId}`,
        ).andThen((versionId) =>
          applyAction(data.scope, data.actionId, data.payload).map(
            (updatedContent) => ({
              versionId,
              updatedContent,
            }),
          ),
        ),
      );
    },
  );
```

### Schema risposta AI (validato server-side)

```ts
const CesareFindingSchema = z.object({
  id: z.string().uuid(),
  severity: z.enum(["critical", "warning", "info"]),
  category: z.string(),
  diagnosis: z.string().min(1).max(500),
  possibleMove: z.string().max(500).nullable(),
  anchor: z.discriminatedUnion("kind", [
    z.object({ kind: "scene", sceneId: z.string().uuid() }),
    z.object({ kind: "act", actId: z.string().uuid() }),
    z.object({
      kind: "textRange",
      start: z.number().int(),
      end: z.number().int(),
    }),
    z.object({
      kind: "screenplayRange",
      from: z.number().int(),
      to: z.number().int(),
    }),
    z.object({ kind: "document" }), // intero documento, raro
  ]),
  actions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        kind: z.enum(["destructive", "suggestion", "noop"]),
        payload: z.record(z.unknown()).optional(),
      }),
    )
    .max(3),
});

const CesareReportSchema = z.object({
  scope: CesareScopeSchema,
  generatedAt: z.string().datetime(),
  findings: z.array(CesareFindingSchema),
});
```

Risposta AI invalida → errore tipizzato `AiResponseInvalidError`. Mai
sovrascrivere il documento se la risposta non è valida.

### Mock mode

In `MOCK_AI=true`, `callCesareAI` short-circuita prima di qualsiasi chiamata
HTTP e ritorna fixture da `apps/web/mocks/cesare-responses.ts`. La fixture ha:

- 3 finding per logline (1 per ogni severità)
- 12 finding per outline (5 categorie miste)
- 25 finding per screenplay (con raggruppamento atteso)

Le fixture sono ancorate a ID stabili presenti nei dati di seed E2E, così i
test possono asserire posizioni esatte.

### Domain errors

```ts
// apps/web/app/features/predictions/cesare.errors.ts
export class AiUnavailableError {
  readonly _tag = "AiUnavailableError" as const;
  readonly message = "Cesare non è disponibile in questo momento";
}

export class DocumentEmptyError {
  readonly _tag = "DocumentEmptyError" as const;
  readonly message: string;
  constructor(readonly scope: string) {
    this.message = `Cesare non può analizzare un ${scope} vuoto`;
  }
}

export class AiResponseInvalidError {
  readonly _tag = "AiResponseInvalidError" as const;
  readonly message = "Risposta AI non valida — Cesare non ha potuto leggere";
}

export class AiActionFailedError {
  readonly _tag = "AiActionFailedError" as const;
  readonly message: string;
  constructor(reason: string) {
    this.message = `Azione di Cesare fallita: ${reason}`;
  }
}
```

---

## Data Flow

### Analisi

```
User clicks "✦ Chiedi a Cesare"
  → useCesare hook chiama analyzeWithCesare({ scope })
  → server: loadContentForScope → buildPrompt → callCesareAI → parseAndValidate
  → response: CesareReport
  → client: cesareStore aggiorna findings + visibility
  → markers renderizzati nel contesto attivo (overlay/cards/PM decorations)
  → status bar appare con conteggi
```

### Esecuzione azione

```
User clicks "Sposta dopo II atto" nel popover
  → useCesare.executeAction({ findingId, actionId, payload })
  → ottimistic UI: animazione di drag della card (300-500ms)
  → server: executeCesareAction
    → createPreActionVersion (chiamata interna a createManualVersion del drawer)
    → applyAction (mutazione del documento)
    → return { versionId, updatedContent }
  → cache invalidation: ["documents", documentId]
  → toast: "Cesare ha spostato la scena 7 — Annulla" (10 sec)
  → marker rimosso da cesareStore
  → counter status bar decrementato
  → onAnnulla → restoreVersion(versionId)
```

---

## UI Components

### Nuovo feature folder: `apps/web/app/features/cesare/`

```
features/cesare/
├── components/
│   ├── CesareToolbarButton.tsx        ← bottone trigger (riusabile in 3 toolbar)
│   ├── CesareToolbarButton.module.css
│   ├── CesarePopover.tsx              ← popover ancorato (floating-ui)
│   ├── CesarePopover.module.css
│   ├── CesareStatusBar.tsx            ← status bar sticky
│   ├── CesareStatusBar.module.css
│   ├── CesareMarkerOverlay.tsx        ← overlay per logline (textarea wavy)
│   ├── CesareMarkerOverlay.module.css
│   ├── CesareSceneMarker.tsx          ← marker per outline timeline
│   └── CesareSceneMarker.module.css
├── hooks/
│   ├── useCesare.ts                   ← stato + chiamate server
│   ├── useCesareActions.ts            ← esegui azione + undo
│   └── useCesareDismiss.ts            ← persistenza dismiss localStorage
├── plugins/
│   └── cesarePlugin.ts                ← ProseMirror plugin per screenplay
├── state/
│   └── cesareStore.ts                 ← Zustand store (per scope corrente)
├── types/
│   └── cesare.types.ts                ← tipi inferiti da Zod schemas
└── index.ts
```

### Composizione design system

Tutti i componenti compongono primitivi da `packages/ui`:

- `Button` per bottone toolbar e azioni del popover
- `Popover` (con floating-ui wrapper) per il `CesarePopover`
- `Toast` per le notifiche di azione
- `Badge` per i conteggi severità nella status bar
- Token CSS: `--color-error`, `--color-warning`, `--color-info`,
  `--color-accent`, `--radius-md`, `--shadow-sm`

Mai stili hardcoded. Mai duplicare componenti che esistono in `packages/ui`.

### Scope adapters (integrazione nei tre editor)

```
features/documents/components/NarrativeEditor.tsx
  → import { CesareToolbarButton, CesareMarkerOverlay } from "~/features/cesare"
  → renderizza il bottone in toolbar quando type === "logline"
  → wrappa il textarea con CesareMarkerOverlay

features/documents/components/OutlineTimeline.tsx
  → import { CesareToolbarButton, CesareSceneMarker } from "~/features/cesare"
  → renderizza il bottone in toolbar
  → ogni TimelineCard riceve marker via data-cesare-* attributes
  → CesareSceneMarker rende l'overlay glifo + alone

features/screenplay-editor/components/ScreenplayEditor.tsx
  → import { CesareToolbarButton } from "~/features/cesare"
  → import { cesarePlugin } from "~/features/cesare/plugins/cesarePlugin"
  → registra cesarePlugin nell'EditorState ProseMirror
```

La status bar è renderizzata una sola volta a livello di route (es.
`_app.projects.$id.outline.tsx`) — riceve lo scope corrente dal contesto.

---

## Files

### New

```
apps/web/app/features/cesare/                           ← intero feature folder (vedi sopra)
apps/web/app/features/predictions/server/cesare.server.ts
apps/web/app/features/predictions/server/cesare-action.server.ts
apps/web/app/features/predictions/cesare.schema.ts      ← Zod schemas
apps/web/app/features/predictions/cesare.errors.ts
apps/web/mocks/cesare-responses.ts                      ← fixture MOCK_AI
docs/specs/17-cesare-assistant.md                       ← questo file
tests/cesare/cesare-logline.spec.ts                     ← OHW-320..324
tests/cesare/cesare-outline.spec.ts                     ← OHW-325..330
tests/cesare/cesare-screenplay.spec.ts                  ← OHW-331..335
```

### Modified

```
apps/web/app/features/documents/components/NarrativeEditor.tsx
  → integrare CesareToolbarButton + CesareMarkerOverlay per scope logline
apps/web/app/features/documents/components/OutlineTimeline.tsx
  → integrare CesareToolbarButton + CesareSceneMarker
apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx
  → integrare CesareToolbarButton + cesarePlugin
apps/web/app/routes/_app.projects.$id_.logline.tsx
  → mount CesareStatusBar
apps/web/app/routes/_app.projects.$id_.outline.tsx
  → mount CesareStatusBar
apps/web/app/routes/_app.projects.$id_.screenplay.index.tsx
  → mount CesareStatusBar
packages/ui/                                            ← se servono nuovi primitivi (es. wrapper floating-ui)
```

---

## Tests

### File: `tests/cesare/cesare-logline.spec.ts` — Cesare in scope logline

| Tag     | Scenario                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| OHW-320 | Bottone `✦ Chiedi a Cesare` visibile in toolbar logline                                                                                        |
| OHW-321 | Click sul bottone → loading state → marker appaiono sui range marcati                                                                          |
| OHW-322 | Hover su un marker → popover si apre ancorato al range, mostra diagnosi                                                                        |
| OHW-323 | Click su `Suggerisci riscrittura` → seconda chiamata AI, mostra proposta nel popover, `Applica` aggiorna la logline E crea versione automatica |
| OHW-324 | Click su `Ignora questo` → marker scompare, dismiss persistito, re-run non lo rimostra                                                         |

### File: `tests/cesare/cesare-outline.spec.ts` — Cesare in scope outline

| Tag     | Scenario                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| OHW-325 | Bottone visibile in toolbar timeline scaletta + click avvia analisi                                                            |
| OHW-326 | Marker appaiono sulle card scene + alone sull'atto coinvolto                                                                   |
| OHW-327 | Status bar in basso mostra conteggi per severità                                                                               |
| OHW-328 | `Vai al prossimo ▶` scrolla al marker successivo + halo pulsante                                                               |
| OHW-329 | Click su `Sposta dopo II atto` → animazione drag + versione automatica + toast `Annulla` → click `Annulla` ripristina versione |
| OHW-330 | Edit della scena dopo l'analisi → marker fade out + bottone toolbar passa a `report stantio`                                   |

### File: `tests/cesare/cesare-screenplay.spec.ts` — Cesare in scope screenplay

| Tag     | Scenario                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------- |
| OHW-331 | Bottone visibile in toolbar screenplay editor + click avvia analisi                               |
| OHW-332 | ProseMirror decorations applicate ai range marcati (wavy underline)                               |
| OHW-333 | Threshold di visibilità: di default solo critici, toggle in status bar mostra attenzioni e spunti |
| OHW-334 | Raggruppamento `✦ +N` su una pagina con più di 10 marker — espandibile                            |
| OHW-335 | Cancellazione di un range marcato → marker scompare, counter decrementato                         |

Tutti i test girano con `MOCK_AI=true`. Le fixture in
`apps/web/mocks/cesare-responses.ts` ancorano i finding a ID/range stabili
presenti nei dati di seed E2E.

---

## Constraints

- **Versione automatica obbligatoria** prima di ogni azione AI distruttiva.
  Nessuna eccezione. Label versione: `Prima dell'azione di Cesare: <azione>`.
- **No drawer, no modal, no pannello laterale**. Cesare vive in-page tramite
  marker DOM + popover ancorati + status bar sticky.
- **Floating-ui** per il posizionamento del popover — niente `position:
absolute` calcolato a mano.
- **`prefers-reduced-motion`** rispettato in tutte le animazioni: halo,
  drag scene, fade marker, slide-in status bar.
- **Composizione `packages/ui`**: ogni primitivo (Button, Popover, Toast,
  Badge) deve essere riusato dal design system, mai duplicato.
- **Glifo `✦`** è la firma visiva di Cesare. Usato consistentemente in
  bottone, marker, popover, status bar, toast.
- **Nessuna telemetria** delle modifiche AI verso terzi. Le azioni di Cesare
  sono log internamente per debug ma mai esposte fuori dal sistema.
- **MOCK_AI=true** fornisce risposte deterministiche per i test E2E.
- **Persistenza dismiss in localStorage** per ora. Promozione a tabella DB
  quando arriverà la sincronizzazione cross-device.
- **Threshold di visibilità in screenplay** previene il "compito col rosso":
  di default solo critici, attenzioni e spunti dietro toggle.
- **Coesistenza con comments del writer**: due affordance visive distinte
  (`💬` per comments, `✦` per Cesare) — mai sovrapporle.
- Commit: `[OHW] feat: cesare assistente AI universale (logline + outline + screenplay)`
