# Spec 16 — Logline → Scaletta automatica

## Context

The writer has a logline. No screenplay exists yet — this is a development-first workflow: the writer starts from the idea, not from the finished script. Spec 14 and 14b go screenplay → documents; this spec goes the opposite direction: logline → outline.

The writer clicks a button in the OutlineTimeline toolbar (Spec 15), selects a structural model (3-act classic, 5-act, sequences), and the AI proposes a full outline of 15–20 scenes divided into acts. The writer sees a preview, and can accept or reject. Accepting auto-versions the current outline before replacing it.

Depends on: Spec 04 (NarrativeEditor, logline document), Spec 15 (OutlineTimeline), Spec 06b (universal versioning), Spec 07 (AI predictions pattern).

---

## User Story

As a writer, I want to generate a first draft outline from my logline so that I can start structuring my story before writing a single scene.

Acceptance criteria:

- The button is visible in the OutlineTimeline toolbar whenever a logline document exists and is non-empty for the project
- Clicking opens a modal where I choose the structural model before generation starts
- The AI generates a preview outline (15–20 scenes, divided into acts per the chosen model)
- I can see the full preview before committing
- If I accept, the current outline is versioned automatically, then replaced with the generated one
- If I reject, nothing changes
- With `MOCK_AI=true` the flow works end-to-end using fixture responses

---

## Behaviour

### Entry point — toolbar button

Location: `OutlineTimeline` toolbar, right side, next to the existing toolbar actions.

Label: **"Genera scaletta"** (Italian UI, consistent with app locale).

Visibility rule: the button renders only when `logline.content` (plain text extracted from the logline document) is non-empty. If the logline document doesn't exist or is empty, the button is hidden — no tooltip, no disabled state.

Clicking always opens the **Model Picker Modal** first. Generation does not start immediately.

### Step 1 — Model Picker Modal

```
┌────────────────────────────────────────────────┐
│  Genera scaletta dalla logline                  │
│                                                │
│  Scegli il modello strutturale:                │
│                                                │
│  ○  3 atti (classico)                          │
│     Setup · Confronto · Risoluzione            │
│                                                │
│  ○  5 atti                                     │
│     Esposizione · Azione crescente ·           │
│     Climax · Azione calante · Epilogo          │
│                                                │
│  ○  Sequenze (8 sequenze)                      │
│     Status quo → Incidente scatenante →        │
│     Prima porta → … → Climax → Nuovo status    │
│                                                │
│                  [Annulla]  [Genera →]         │
└────────────────────────────────────────────────┘
```

- Default selection: 3 atti (classico)
- "Genera →" is disabled until a model is selected
- "Annulla" closes the modal, no side effects
- Clicking "Genera →" closes the picker and opens the Preview Modal in loading state

### Step 2 — Preview Modal (loading state)

```
┌────────────────────────────────────────────────┐
│  Scaletta generata — 3 atti (classico)          │
│                                                │
│  ⟳  Generazione in corso…                      │
│                                                │
│                          [Annulla]             │
└────────────────────────────────────────────────┘
```

- Spinner shown while the server function is in flight
- "Annulla" during loading calls `AbortController.abort()` on the pending request, then closes both modals

### Step 3 — Preview Modal (result state)

```
┌────────────────────────────────────────────────────────┐
│  Scaletta generata — 3 atti (classico)                  │
│                                                        │
│  ▾ Atto I — Setup  (6 scene)                           │
│    1. INT. APPARTAMENTO DI SARA - MATTINA              │
│       Sara si sveglia in ritardo, trova un biglietto…  │
│    2. EXT. STAZIONE - GIORNO                           │
│       …                                                │
│    ⋮                                                   │
│                                                        │
│  ▾ Atto II — Confronto  (10 scene)                     │
│    7. INT. UFFICIO DEL BOSS - GIORNO                   │
│       …                                                │
│    ⋮                                                   │
│                                                        │
│  ▾ Atto III — Risoluzione  (4 scene)                   │
│    17. EXT. PONTE - NOTTE                              │
│        …                                               │
│                                                        │
│  [← Cambia modello]    [Rifiuta]    [Accetta scaletta] │
└────────────────────────────────────────────────────────┘
```

- Acts are collapsed by default; clicking the act header toggles expansion
- Each scene shows: number, slugline (uppercase), one-line description
- Scene count per act shown in the act header
- Total scene count shown in the modal title area
- "← Cambia modello" returns to the Model Picker Modal (clears the generated result, does NOT re-generate automatically)
- "Rifiuta" closes the modal, no changes applied
- "Accetta scaletta" triggers the accept flow (see below)

### Accept flow

When the writer clicks "Accetta scaletta":

1. Server: create a version snapshot of the current outline document (same mechanism as Spec 06b — `createDocumentVersion`) with label `"Prima di generazione AI"` and `source: "auto"`
2. Server: replace the outline document's `content` with the `OutlineContent` built from the AI response
3. Client: close the modal, invalidate the outline query, the timeline re-renders with the new content
4. Client: show a transient toast: _"Scaletta generata applicata. Versione precedente salvata automaticamente."_

If versioning fails, the outline content is NOT replaced. The error surfaces as a toast: _"Errore durante il salvataggio della versione. Scaletta non modificata."_

---

## Structural Models

```typescript
export const OutlineStructuralModels = {
  THREE_ACTS: "three_acts",
  FIVE_ACTS: "five_acts",
  SEQUENCES: "sequences",
} as const;

export type OutlineStructuralModel =
  (typeof OutlineStructuralModels)[keyof typeof OutlineStructuralModels];
```

Each model maps to a prompt instruction and an expected act structure:

| Model        | Acts                                                               | Target scene count |
| ------------ | ------------------------------------------------------------------ | ------------------ |
| `three_acts` | Setup / Confronto / Risoluzione                                    | 15–20              |
| `five_acts`  | Esposizione / Azione crescente / Climax / Azione calante / Epilogo | 15–20              |
| `sequences`  | 8 sequenze nominate                                                | 16–24              |

---

## AI Prompt Strategy

### System prompt

```
You are an expert screenplay structure consultant. Your task is to generate a beat outline from a logline.

Rules:
- Generate between 15 and 20 scenes (or 16–24 for the sequences model)
- Each scene must have: a slugline (INT./EXT. LOCATION - TIME), a one-line description of the dramatic action
- Distribute scenes across acts according to the structural model provided
- Keep descriptions concrete and visual — what we SEE, not what characters feel
- Do not invent character names not implied by the logline; use descriptive labels (es. "LA PROTAGONISTA", "IL ANTAGONISTA")
- Respond ONLY with valid JSON. No prose, no explanation outside the JSON.
```

### User message

```
Logline: {{logline}}

Structural model: {{model_label}}
Acts: {{acts_definition}}

Generate a scene outline following the JSON schema below.
```

### Output JSON schema (Zod)

```typescript
export const AiSceneSchema = z.object({
  slugline: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
});

export const AiActSchema = z.object({
  title: z.string().min(1).max(100),
  scenes: z.array(AiSceneSchema).min(1).max(30),
});

export const AiOutlineResponseSchema = z.object({
  acts: z.array(AiActSchema).min(2).max(8),
});

export type AiOutlineResponse = z.infer<typeof AiOutlineResponseSchema>;
```

The server validates the AI response with this schema before returning. If validation fails, the server returns `AiResponseInvalidError`.

### Mapping AI response → OutlineContent

The transformer `toOutlineContent(aiResponse: AiOutlineResponse): OutlineContent` is a pure function in `features/predictions/lib/outline-transforms.ts`. It assigns new UUIDs to each act and scene, initialises `pageEstimate`, `notes`, `comments`, and `color` to `null`, and `characters` to `[]`.

---

## Server Architecture

### New server function

`features/predictions/server/predictions.server.ts` — add:

```typescript
export const generateOutlineFromLogline = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      model: z.nativeEnum(OutlineStructuralModels),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        OutlineContent,
        | LoglineNotFoundError
        | LoglineEmptyError
        | AiResponseInvalidError
        | ForbiddenError
        | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();
      return toShape(
        await generateOutlineFromLoglineFn(
          db,
          user.id,
          data.projectId,
          data.model,
        ),
      );
    },
  );
```

The inner pure function `generateOutlineFromLoglineFn` lives in `features/predictions/lib/generate-outline.ts` and has this signature:

```typescript
const generateOutlineFromLoglineFn = (
  db: Db,
  userId: string,
  projectId: string,
  model: OutlineStructuralModel,
): ResultAsync<
  OutlineContent,
  LoglineNotFoundError | LoglineEmptyError | AiResponseInvalidError | ForbiddenError | DbError
>
```

Steps (each returning ResultAsync, chained with `.andThen`):

1. Load logline document for `projectId` — error: `LoglineNotFoundError`
2. Extract plain text from logline content — error: `LoglineEmptyError` if blank
3. Check user has at least viewer role on the project — error: `ForbiddenError`
4. Call AI (or mock) with logline + model — error: `AiResponseInvalidError` on parse failure
5. Map AI response to `OutlineContent` via `toOutlineContent`

### Apply server function

`features/documents/server/documents.server.ts` — add:

```typescript
export const applyGeneratedOutline = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      content: OutlineContentSchema,
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<void, DocumentNotFoundError | ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();
      return toShape(
        await applyGeneratedOutlineFn(
          db,
          user.id,
          data.projectId,
          data.content,
        ),
      );
    },
  );
```

Steps inside `applyGeneratedOutlineFn`:

1. Load the outline document for `projectId` — error: `DocumentNotFoundError`
2. Check user has editor or owner role — error: `ForbiddenError`
3. Create version snapshot via `createDocumentVersion(db, doc.id, { label: "Prima di generazione AI", source: "auto" })` — error: `DbError`
4. Replace `documents.content` with the new `OutlineContent` JSON — error: `DbError`

Steps 3 and 4 run inside a single Drizzle transaction. If either fails, both roll back.

### New error types — `features/predictions/predictions.errors.ts`

```typescript
export class LoglineNotFoundError {
  readonly _tag = "LoglineNotFoundError" as const;
  readonly message: string;
  constructor(readonly projectId: string) {
    this.message = `Logline not found for project: ${projectId}`;
  }
}

export class LoglineEmptyError {
  readonly _tag = "LoglineEmptyError" as const;
  readonly message = "Logline is empty — cannot generate outline";
}

export class AiResponseInvalidError {
  readonly _tag = "AiResponseInvalidError" as const;
  readonly message: string;
  readonly parseError: string;
  constructor(cause: unknown) {
    this.parseError =
      cause instanceof Error ? cause.message : String(cause ?? null);
    this.message = `AI response did not match expected schema: ${this.parseError}`;
  }
}
```

---

## Mock Responses

File: `mocks/ai-responses.ts` — add:

```typescript
export const mockOutlineFromLogline: Record<
  OutlineStructuralModel,
  AiOutlineResponse
> = {
  three_acts: {
    acts: [
      {
        title: "Atto I — Setup",
        scenes: [
          {
            slugline: "INT. APPARTAMENTO DI SARA - MATTINA",
            description:
              "Sara si sveglia tardi, trova un biglietto anonimo sotto la porta.",
          },
          {
            slugline: "EXT. STAZIONE - GIORNO",
            description: "Sara sale sul treno sbagliato per distrazione.",
          },
          {
            slugline: "INT. SCOMPARTIMENTO - GIORNO",
            description:
              "Sara incontra un uomo misterioso che conosce il suo nome.",
          },
          {
            slugline: "INT. UFFICIO DI POLIZIA - GIORNO",
            description: "Sara denuncia l'accaduto; l'agente non le crede.",
          },
          {
            slugline: "EXT. STRADA DEL QUARTIERE - SERA",
            description: "Sara viene seguita. Si rifugia in un bar.",
          },
          {
            slugline: "INT. BAR - SERA",
            description: "Sara chiama la sua migliore amica. La linea cade.",
          },
        ],
      },
      {
        title: "Atto II — Confronto",
        scenes: [
          {
            slugline: "INT. APPARTAMENTO DELLA AMICA - NOTTE",
            description: "Sara trova l'appartamento vuoto e in disordine.",
          },
          {
            slugline: "EXT. CANTIERE ABBANDONATO - NOTTE",
            description: "Sara trova indizi che la portano più in profondità.",
          },
          {
            slugline: "INT. ARCHIVIO COMUNALE - GIORNO",
            description: "Sara scopre un vecchio fascicolo con il suo nome.",
          },
          {
            slugline: "EXT. PARCO CENTRALE - GIORNO",
            description:
              "Incontro con un informatore. Viene interrotto bruscamente.",
          },
          {
            slugline: "INT. HOTEL ECONOMICO - NOTTE",
            description: "Sara non può tornare a casa. Si nasconde.",
          },
          {
            slugline: "INT. HOTEL ECONOMICO - MATTINA",
            description: "Sara riceve una chiamata con istruzioni.",
          },
          {
            slugline: "EXT. PORTO INDUSTRIALE - GIORNO",
            description: "Sara arriva all'appuntamento. Trappola.",
          },
          {
            slugline: "INT. MAGAZZINO PORTUALE - GIORNO",
            description: "Sara viene catturata. Incontra l'antagonista.",
          },
          {
            slugline: "INT. MAGAZZINO PORTUALE - SERA",
            description:
              "L'antagonista rivela la verità sulla sparizione dell'amica.",
          },
          {
            slugline: "EXT. MAGAZZINO PORTUALE - SERA",
            description: "Sara riesce a fuggire, ferita.",
          },
        ],
      },
      {
        title: "Atto III — Risoluzione",
        scenes: [
          {
            slugline: "INT. PRONTO SOCCORSO - NOTTE",
            description: "Sara viene medicata. Chiama un'alleata inaspettata.",
          },
          {
            slugline: "INT. UFFICIO DI POLIZIA - NOTTE",
            description: "Sara porta le prove. Stavolta l'agente ascolta.",
          },
          {
            slugline: "EXT. EDIFICIO INDUSTRIALE - ALBA",
            description:
              "Blitz delle forze dell'ordine. Sara guida la squadra.",
          },
          {
            slugline: "INT. EDIFICIO INDUSTRIALE - ALBA",
            description: "Sara libera l'amica. L'antagonista viene arrestato.",
          },
          {
            slugline: "EXT. STAZIONE - MATTINA",
            description: "Sara e l'amica ripartono. Il treno giusto, stavolta.",
          },
        ],
      },
    ],
  },

  five_acts: {
    acts: [
      {
        title: "Atto I — Esposizione",
        scenes: [
          {
            slugline: "INT. CASA DELLA PROTAGONISTA - MATTINA",
            description: "La protagonista nella sua routine quotidiana.",
          },
          {
            slugline: "EXT. CITTÀ - GIORNO",
            description: "L'incidente scatenante rompe la routine.",
          },
          {
            slugline: "INT. UFFICIO - GIORNO",
            description: "La protagonista cerca risposte ma non le trova.",
          },
        ],
      },
      {
        title: "Atto II — Azione crescente",
        scenes: [
          {
            slugline: "EXT. PERIFERIA - SERA",
            description:
              "Prima svolta: la protagonista trova un indizio chiave.",
          },
          {
            slugline: "INT. BIBLIOTECA - GIORNO",
            description: "La protagonista ricerca il passato.",
          },
          {
            slugline: "EXT. PORTO - NOTTE",
            description: "Primo confronto con l'antagonista, senza esito.",
          },
          {
            slugline: "INT. APPARTAMENTO - NOTTE",
            description:
              "La protagonista mette in discussione le sue certezze.",
          },
        ],
      },
      {
        title: "Atto III — Climax",
        scenes: [
          {
            slugline: "EXT. FABBRICA ABBANDONATA - NOTTE",
            description: "Lo scontro decisivo si avvicina.",
          },
          {
            slugline: "INT. FABBRICA ABBANDONATA - NOTTE",
            description: "Climax: la protagonista affronta la verità.",
          },
          {
            slugline: "INT. FABBRICA ABBANDONATA - NOTTE",
            description: "Il punto di non ritorno. Tutto è in gioco.",
          },
        ],
      },
      {
        title: "Atto IV — Azione calante",
        scenes: [
          {
            slugline: "EXT. FABBRICA ABBANDONATA - ALBA",
            description: "Le conseguenze del climax si dispiegano.",
          },
          {
            slugline: "INT. OSPEDALE - GIORNO",
            description: "La protagonista raccoglie i pezzi.",
          },
          {
            slugline: "INT. COMMISSARIATO - GIORNO",
            description:
              "Le autorità intervengono. La situazione si chiarisce.",
          },
        ],
      },
      {
        title: "Atto V — Epilogo",
        scenes: [
          {
            slugline: "EXT. CITTÀ - GIORNO",
            description: "Il mondo è cambiato. La protagonista anche.",
          },
          {
            slugline: "INT. CASA DELLA PROTAGONISTA - SERA",
            description: "Chiusura del cerchio. Nuova routine, nuova persona.",
          },
        ],
      },
    ],
  },

  sequences: {
    acts: [
      {
        title: "Sequenza 1 — Status quo",
        scenes: [
          {
            slugline: "INT. CASA - MATTINA",
            description: "Il mondo ordinario della protagonista.",
          },
          {
            slugline: "EXT. STRADA - GIORNO",
            description: "Il primo segnale che qualcosa non va.",
          },
        ],
      },
      {
        title: "Sequenza 2 — Incidente scatenante",
        scenes: [
          {
            slugline: "INT. UFFICIO - GIORNO",
            description: "L'evento che rompe l'equilibrio.",
          },
          {
            slugline: "EXT. CITTÀ - SERA",
            description: "La protagonista reagisce al cambiamento.",
          },
        ],
      },
      {
        title: "Sequenza 3 — Prima porta",
        scenes: [
          {
            slugline: "INT. LUOGO SCONOSCIUTO - NOTTE",
            description: "La protagonista entra nel mondo straordinario.",
          },
          {
            slugline: "EXT. PERIFERIA - NOTTE",
            description: "Primo ostacolo.",
          },
        ],
      },
      {
        title: "Sequenza 4 — Piano e preparazione",
        scenes: [
          {
            slugline: "INT. BASE OPERATIVA - GIORNO",
            description: "La protagonista raccoglie alleati e risorse.",
          },
          {
            slugline: "EXT. LUOGO CHIAVE - GIORNO",
            description: "Sopralluogo prima dell'azione.",
          },
        ],
      },
      {
        title: "Sequenza 5 — Punto di svolta centrale",
        scenes: [
          {
            slugline: "INT. LUOGO CHIAVE - NOTTE",
            description: "Il piano va storto. Rivelazione.",
          },
          {
            slugline: "EXT. LUOGO CHIAVE - NOTTE",
            description: "Fuga e conseguenze.",
          },
        ],
      },
      {
        title: "Sequenza 6 — Crisi e dubbi",
        scenes: [
          {
            slugline: "INT. RIFUGIO - NOTTE",
            description: "Momento oscuro della protagonista.",
          },
          {
            slugline: "INT. RIFUGIO - MATTINA",
            description: "Ritrovare la determinazione.",
          },
        ],
      },
      {
        title: "Sequenza 7 — Climax",
        scenes: [
          {
            slugline: "EXT. LUOGO FINALE - SERA",
            description: "La protagonista affronta l'antagonista.",
          },
          {
            slugline: "INT. LUOGO FINALE - NOTTE",
            description: "Lo scontro decisivo. Sacrificio o vittoria.",
          },
        ],
      },
      {
        title: "Sequenza 8 — Nuovo status quo",
        scenes: [
          {
            slugline: "EXT. MONDO CAMBIATO - ALBA",
            description: "Il mondo dopo il climax.",
          },
          {
            slugline: "INT. CASA - GIORNO",
            description: "La protagonista nel suo nuovo equilibrio.",
          },
        ],
      },
    ],
  },
};
```

The mock is selected by `model` key. The AI call in `generate-outline.ts` checks `process.env.MOCK_AI === "true"` before calling Anthropic, and returns `ok(mockOutlineFromLogline[model])` wrapped in `ResultAsync`.

---

## UI Components

### New components

| File                                                                 | Role                                   |
| -------------------------------------------------------------------- | -------------------------------------- |
| `features/predictions/components/LoglineToScalettaButton.tsx`        | Toolbar button, visibility logic       |
| `features/predictions/components/LoglineToScalettaButton.module.css` | Button styles                          |
| `features/predictions/components/ModelPickerModal.tsx`               | Step 1 modal                           |
| `features/predictions/components/ModelPickerModal.module.css`        | Modal styles                           |
| `features/predictions/components/OutlinePreviewModal.tsx`            | Step 2/3 modal (loading + result)      |
| `features/predictions/components/OutlinePreviewModal.module.css`     | Modal styles                           |
| `features/predictions/components/OutlinePreviewAct.tsx`              | Collapsible act section inside preview |

### Modified components

| File                                                | Change                                     |
| --------------------------------------------------- | ------------------------------------------ |
| `features/documents/components/OutlineTimeline.tsx` | Add `<LoglineToScalettaButton>` in toolbar |

### State management in `OutlineTimeline`

A local `useReducer` manages the modal flow state:

```typescript
type ModalState =
  | { step: "closed" }
  | { step: "picking"; selectedModel: OutlineStructuralModel }
  | { step: "loading"; model: OutlineStructuralModel }
  | { step: "preview"; model: OutlineStructuralModel; result: OutlineContent }
  | { step: "applying" };
```

Transitions:

- `closed` → `picking` (button click)
- `picking` → `loading` (Genera → click, model selected)
- `picking` → `closed` (Annulla)
- `loading` → `preview` (server fn returns ok)
- `loading` → `closed` (Annulla or error)
- `preview` → `picking` (← Cambia modello)
- `preview` → `closed` (Rifiuta)
- `preview` → `applying` (Accetta scaletta)
- `applying` → `closed` (success or error)

Error in `loading` or `applying` surfaces as a toast and returns to `closed`.

---

## Data Flow

```
[OutlineTimeline toolbar]
       │ click "Genera scaletta"
       ▼
[ModelPickerModal] — user picks model
       │ click "Genera →"
       ▼
[generateOutlineFromLogline({ projectId, model })]  ← createServerFn POST
       │
       ├── load logline document (DB)
       ├── extract plain text
       ├── check user role
       ├── call Anthropic (or mock)
       ├── validate AiOutlineResponseSchema
       └── toOutlineContent(aiResponse) → OutlineContent
       │
       ▼
[OutlinePreviewModal] — user sees acts/scenes
       │ click "Accetta scaletta"
       ▼
[applyGeneratedOutline({ projectId, content })]  ← createServerFn POST
       │
       ├── load outline document (DB)
       ├── check user role (editor/owner)
       ├── createDocumentVersion (auto snapshot)  ← transaction
       └── update documents.content               ← transaction
       │
       ▼
[invalidate outline query] → OutlineTimeline re-renders
[toast: "Scaletta generata applicata…"]
```

---

## Tests

File: `tests/outline/logline-to-scaletta.spec.ts`

All tests run with `MOCK_AI=true`. Each test creates a fresh project via the seed helper and sets up a non-empty logline document before running.

### OHW-300 — Button visible with non-empty logline

- Create project, set logline to "Una detective in pensione viene richiamata per risolvere un caso impossibile."
- Navigate to `/projects/:id/outline`
- Assert "Genera scaletta" button is visible in the toolbar

### OHW-301 — Button hidden when logline is empty

- Create project, leave logline empty (document exists but content is blank)
- Navigate to `/projects/:id/outline`
- Assert "Genera scaletta" button is NOT present in the DOM

### OHW-302 — Model Picker Modal opens and closes

- Navigate with non-empty logline, click "Genera scaletta"
- Assert modal is visible with title "Genera scaletta dalla logline"
- Assert 3 model options are visible
- Assert "Genera →" button is disabled (no model selected yet)
- Click "Annulla" → modal closes, outline unchanged

### OHW-303 — Default model is pre-selected

- Open Model Picker Modal
- Assert "3 atti (classico)" radio is checked by default
- Assert "Genera →" button is enabled

### OHW-304 — Generate with 3-act model (happy path)

- Open modal, keep default "3 atti (classico)", click "Genera →"
- Assert loading modal appears with spinner and "Generazione in corso…"
- Assert preview modal appears with title containing "3 atti (classico)"
- Assert 3 act sections visible (Atto I, II, III)
- Assert total scene count ≥ 15

### OHW-305 — Generate with sequences model

- Open modal, select "Sequenze (8 sequenze)", click "Genera →"
- Assert preview shows 8 act sections
- Assert each act has ≥ 1 scene

### OHW-306 — Cambia modello resets result

- Complete generation with "3 atti (classico)"
- Click "← Cambia modello"
- Assert Model Picker Modal is shown again (not in loading state)
- Assert no preview content is visible

### OHW-307 — Rifiuta closes modal with no changes

- Complete generation with "3 atti (classico)"
- Note current outline state (act/scene count or empty state)
- Click "Rifiuta"
- Assert modal closes
- Assert outline is unchanged

### OHW-308 — Accetta scaletta applies and versions (happy path)

- Project has existing outline with 2 acts and 4 scenes
- Complete generation with "3 atti (classico)"
- Click "Accetta scaletta"
- Assert modal closes
- Assert success toast contains "Scaletta generata applicata"
- Assert outline timeline now shows 3 act sections matching mock data
- Open Versions drawer
- Assert a version with label "Prima di generazione AI" and source "auto" exists

### OHW-309 — Accetta on empty outline still versions

- Project has empty outline (no acts)
- Complete generation with "3 atti (classico)"
- Click "Accetta scaletta"
- Assert outline now shows 3 acts
- Assert Versions drawer shows 1 version (the auto-snapshot of the empty state)

### OHW-310 — Logline empty error handling

- Manually call `generateOutlineFromLogline` with a project whose logline is empty
- Assert result is `{ isOk: false, error: { _tag: "LoglineEmptyError" } }`
- In the UI: if logline is emptied after modal is opened and generation is triggered, assert error toast appears and modal closes

---

## Files

### New

| Path                                                                              | Description                                                                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/app/features/predictions/server/predictions.server.ts`                  | `generateOutlineFromLogline` server function (may already exist for Spec 14 — add to it) |
| `apps/web/app/features/predictions/lib/generate-outline.ts`                       | Pure logic: load logline, call AI, map response                                          |
| `apps/web/app/features/predictions/lib/outline-transforms.ts`                     | `toOutlineContent(AiOutlineResponse): OutlineContent`                                    |
| `apps/web/app/features/predictions/predictions.errors.ts`                         | `LoglineNotFoundError`, `LoglineEmptyError`, `AiResponseInvalidError`                    |
| `apps/web/app/features/predictions/components/LoglineToScalettaButton.tsx`        | Toolbar button                                                                           |
| `apps/web/app/features/predictions/components/LoglineToScalettaButton.module.css` |                                                                                          |
| `apps/web/app/features/predictions/components/ModelPickerModal.tsx`               | Step 1 modal                                                                             |
| `apps/web/app/features/predictions/components/ModelPickerModal.module.css`        |                                                                                          |
| `apps/web/app/features/predictions/components/OutlinePreviewModal.tsx`            | Step 2/3 modal                                                                           |
| `apps/web/app/features/predictions/components/OutlinePreviewModal.module.css`     |                                                                                          |
| `apps/web/app/features/predictions/components/OutlinePreviewAct.tsx`              | Collapsible act row                                                                      |
| `packages/domain/src/outline-generation.schema.ts`                                | `AiSceneSchema`, `AiActSchema`, `AiOutlineResponseSchema`, `OutlineStructuralModels`     |
| `tests/outline/logline-to-scaletta.spec.ts`                                       | OHW-300..310                                                                             |

### Modified

| Path                                                             | Change                                        |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `apps/web/app/features/documents/server/documents.server.ts`     | Add `applyGeneratedOutline` server function   |
| `apps/web/app/features/documents/components/OutlineTimeline.tsx` | Add `<LoglineToScalettaButton>` in toolbar    |
| `mocks/ai-responses.ts`                                          | Add `mockOutlineFromLogline`                  |
| `packages/domain/src/schemas/index.ts`                           | Re-export from `outline-generation.schema.ts` |

---

## Constraints

- The button is only visible when the logline is non-empty. The check happens client-side from the already-loaded logline query; no extra server round-trip.
- `applyGeneratedOutline` must version AND replace in a single Drizzle transaction. If the transaction fails, neither operation is persisted.
- The AI response must pass `AiOutlineResponseSchema` validation server-side before it is returned to the client. Invalid responses surface as `AiResponseInvalidError`, never as raw AI text.
- `toOutlineContent` is a pure function with no DB calls. It is tested in isolation (Playwright Node runner).
- No Anthropic API calls are made when `MOCK_AI=true`. The mock key is the `OutlineStructuralModel` value.
- Never expose the Anthropic API key to the client.
- The `OutlineStructuralModels` const object and `OutlineStructuralModel` type live in `packages/domain` so the future mobile companion can use them without importing React or Monaco.
- The modal flow state lives in `OutlineTimeline` via `useReducer`. No global state, no context.
- Cancelling during loading must abort the in-flight request via `AbortController`. The server function call must accept an `AbortSignal`.
