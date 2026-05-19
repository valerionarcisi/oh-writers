# Spec 29 — Cesare: Production-Aware Chat Panel

> **This spec extends Spec 17** (Cesare assistente AI universale — inline markers, logline/outline/screenplay scopes). Spec 17 defines the read-and-annotate mode of Cesare (marker overlays, popovers, status bar). Spec 29 defines a complementary mode: a **persistent chat drawer** that gives Cesare awareness of the full production graph — screenplay, breakdown, budget, and schedule — and supports free-form conversational queries that cross domain boundaries.
>
> The two modes coexist. Spec 17 Cesare stays in-page and focused. Spec 29 Cesare opens as a right-side drawer and handles cross-domain questions that neither a marker nor a quick action can answer.

---

## 1. Summary

Cesare in chat mode is a production-aware AI assistant named after **Cesare Zavattini**, the Italian neorealist screenwriter and collaborator. Unlike generic AI chat tools, Cesare assembles a rich production context payload before calling the Anthropic API — it knows the full screenplay, the breakdown elements for every scene, the budget state by category, and the shooting schedule including actor availability and location bookings.

The panel is a **right-side drawer**, ~380px wide, that slides in alongside the main content without replacing it. It is persistent across all project pages.

### The four primary use cases

| #   | Question (Italian, as a filmmaker would ask it)               | Domains crossed                               |
| --- | ------------------------------------------------------------- | --------------------------------------------- |
| 1   | "Questa scena è fattibile domani?"                            | Breakdown + Schedule + Budget                 |
| 2   | "Suggerisci come riscrivere questa scena per ridurre i costi" | Screenplay + Breakdown + Budget               |
| 3   | "Aiutami a scrivere il dialogo di questa scena"               | Screenplay (character voice from full script) |
| 4   | "Ottimizza lo schedule per ridurre i giorni di ripresa"       | Breakdown + Schedule + Budget                 |

---

## 2. Relationship to Spec 17

| Dimension      | Spec 17 (inline markers)                                    | Spec 29 (chat drawer)                                           |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| UX paradigm    | Liquid — anchored to DOM elements                           | Drawer — persistent right panel                                 |
| Trigger        | "✦ Chiedi a Cesare" toolbar button per editor               | Floating "C" button, `Cmd+Shift+A`, text selection context menu |
| Scope          | One document at a time (logline / outline / screenplay)     | Full production graph                                           |
| Interaction    | Read-only analysis → annotated markers → executable actions | Free-form chat with streaming responses                         |
| Output         | Structured `CesareReport` (findings + anchors)              | Conversational text (markdown, with optional action chips)      |
| Session memory | None (analysis is stateless per run)                        | In-memory per session (open question: persist across sessions?) |

Both modes share the `✦` visual signature and the `CesareContext` assembler on the server. The chat drawer can reference findings from the marker mode ("I see Cesare flagged scene 7 — tell me more") but does not render inline markers.

---

## 3. Entry Points

### 3.1 Floating button

A persistent floating button anchored at the bottom-right of every project page, above the `FloatingDock` if one is present.

```
┌──────────────────────────────────────────────────┐
│                              main content        │
│                                                  │
│                                     ┌──────────┐ │
│                                     │ ⌘⇧A      │ │  ← FloatingDock
│                                     └──────────┘ │
│                                     ┌──────────┐ │
│                                     │    ✦ C   │ │  ← Cesare button
│                                     └──────────┘ │
└──────────────────────────────────────────────────┘
```

The button is a circle (40px), accent background, `✦ C` label. Tooltip: `Apri Cesare (⌘⇧A)`.

### 3.2 Keyboard shortcut

`Cmd+Shift+A` — mnemonic for "Assistente". Toggles the drawer open/closed. Works on all project pages.

### 3.3 Text selection in the screenplay editor

When the user selects text in the screenplay editor and opens the context menu, a new item appears:

```
── Cesare ──────────────────────────
  ✦  Chiedi a Cesare su questa selezione
```

Clicking it opens the chat drawer with the selected text pre-loaded as context and the cursor in the input area, pre-filled with the current scene heading.

---

## 4. Panel Anatomy

```
┌─────────────────────────────────────────┐
│ HEADER                                  │
│ ✦ Cesare                           [✕] │
│ Scena 12 · INT. UFFICIO - GIORNO        │
├─────────────────────────────────────────┤
│ CONTEXT CHIPS                           │
│ [📄 Sceneggiatura] [🎬 Breakdown sc.12] │
│ [💰 Budget]  [📅 Schedule]             │
├─────────────────────────────────────────┤
│                                         │
│ CONVERSATION AREA  (scrollable)         │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ User message              right │   │
│   └─────────────────────────────────┘   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ ✦ Cesare                        │   │
│  │                                  │   │
│  │ Cesare response text here,       │   │
│  │ streaming word by word.          │   │
│  │                                  │   │
│  └──────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ QUICK PROMPTS                           │
│ [Fattibile domani?] [Riduci i costi]   │
│ [Scrivi il dialogo] [Ottimizza sch.]   │
├─────────────────────────────────────────┤
│ INPUT AREA                              │
│ ┌─────────────────────────────────────┐ │
│ │ Scrivi a Cesare…                    │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                  [▶ →] │
└─────────────────────────────────────────┘
```

### 4.1 Header

- Left: `✦` glyph + "Cesare" in the app's heading font
- Subtitle: current context label. On the screenplay editor: `Scena {N} · {heading}`. On the breakdown page: `Breakdown · {project title}`. On pages without a selected scene: `Progetto · {title}`.
- Right: `✕` close button (React Aria `useButton`, `aria-label="Chiudi Cesare"`)

### 4.2 Context chips

Chips show what data Cesare has loaded into the current context payload. Each chip is a pill button that expands inline to show a summary of the loaded data (e.g. "📄 Sceneggiatura: 87 scene, 12 personaggi"). They are informational, not interactive beyond the expand toggle.

| Chip                | Present when                                                             | Expand summary                       |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `📄 Sceneggiatura`  | A screenplay is open in the project                                      | N scenes, M characters               |
| `🎬 Breakdown sc.N` | User is on the breakdown page or screenplay editor with a scene selected | K elements (cast, props, locations…) |
| `💰 Budget`         | Project has a budget defined                                             | Totale €X — residuo €Y               |
| `📅 Schedule`       | Project has a schedule with at least one shooting day                    | N giorni, prossimo: {date}           |

Missing context shows a greyed-out chip: `[📅 Schedule —]` with tooltip "Schedule non ancora definito per questo progetto".

### 4.3 Conversation area

Scrollable. Messages alternate:

- **User messages**: right-aligned, accent background (`--color-accent`), white text, `--radius-md` corners
- **Cesare messages**: left-aligned, surface card (`--color-surface-elevated`), standard text, `--radius-md` corners, prefixed with `✦`
- **Streaming state**: a Cesare bubble appears immediately with an animated ellipsis (`✦ ···`) while the response is being generated. Words replace the ellipsis as they stream in.
- **Empty state** (no messages yet): a centered illustration area showing the `✦` glyph large, and the text: `Ciao. Sono Cesare.\nChiedimi qualcosa sulla produzione.`

### 4.4 Quick prompt chips

Four chips above the input. Single tap pre-fills the textarea. Double-tap (or tap when already pre-filled) sends immediately.

```
[Fattibile domani?]   [Riduci i costi]
[Scrivi il dialogo]   [Ottimizza schedule]
```

Full expanded question injected into the textarea on tap:

| Chip               | Full question injected                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fattibile domani?  | `Questa scena è fattibile nella giornata di ripresa di domani? Considera cast disponibile, location prenotata e budget residuo per la categoria.` |
| Riduci i costi     | `Suggerisci come riscrivere questa scena per ridurre i costi di produzione, mantenendo l'intento narrativo.`                                      |
| Scrivi il dialogo  | `Aiutami a scrivere il dialogo di questa scena. Usa la voce dei personaggi come emerge dal resto della sceneggiatura.`                            |
| Ottimizza schedule | `Ottimizza lo schedule per ridurre il numero totale di giorni di ripresa, considerando le disponibilità degli attori e le location prenotate.`    |

### 4.5 Input area

- `<textarea>` with `aria-label="Messaggio per Cesare"`, auto-grows up to 5 rows
- `Enter` sends. `Shift+Enter` inserts newline.
- Send button: `▶` icon, `aria-label="Invia"`, disabled when textarea is empty or while streaming
- While streaming: the send button becomes a `⬛` stop button that aborts the in-flight fetch

---

## 5. ASCII Mockups

### Mockup A — Screenplay editor + Cesare panel open (with conversation)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────┐  ┌─────────────────────────────────────────────┐  ┌────────────────────────────┐ │
│ │ SIDEBAR  │  │  Sceneggiatura                               │  │ ✦ Cesare              [✕] │ │
│ │          │  │  Scena 12 di 87                              │  │ Scena 12 · INT. UFFICIO   │ │
│ │ Overview │  ├─────────────────────────────────────────────┤  │ GIORNO                    │ │
│ │ Writing▾ │  │                                             │  ├────────────────────────────┤ │
│ │  Logline │  │  INT. UFFICIO DEL DIRETTORE - GIORNO        │  │[📄 Scen.][🎬 Brkdn sc.12] │ │
│ │  Sinopsi │  │                                             │  │[💰 Budget] [📅 Schedule]  │ │
│ │  Scalett │  │  Marco entra nell'ufficio vuoto.             │  ├────────────────────────────┤ │
│ │  Sceneg ◀│  │  Si guarda intorno, afferra il telefono.    │  │                            │ │
│ │ Breakdown│  │                                             │  │  ┌──────────────────────┐  │ │
│ │ Budget   │  │  MARCO                                      │  │  │ Questa scena è       │  │ │
│ │ Schedule │  │       Non ci sei mai quando ho bisogno      │  │  │ fattibile domani?  ◀ │  │ │
│ │          │  │       di te.                                │  │  └──────────────────────┘  │ │
│ │          │  │                                             │  │                            │ │
│ │          │  │  Squilla il cellulare. Marco risponde,      │  │ ┌────────────────────────┐ │ │
│ │          │  │  aggrotta le sopracciglia.                  │  │ │✦                       │ │ │
│ │          │  │                                             │  │ │ Sì, con una riserva.   │ │ │
│ │          │  │  MARCO                                      │  │ │                        │ │ │
│ │          │  │       Sì. Sì, ho capito. Torno subito.      │  │ │ **Cast disponibile:**  │ │ │
│ │          │  │                                             │  │ │ Marco Rossi ✓          │ │ │
│ │          │  │  Marco butta il telefono sulla scrivania.   │  │ │ Direttore (Silvia) ✓   │ │ │
│ │          │  │                                             │  │ │                        │ │ │
│ │          │  │                                             │  │ │ **Location:**          │ │ │
│ │          │  │                                             │  │ │ Ufficio Rossi prenotat │ │ │
│ │          │  │                                             │  │ │ per domani ✓           │ │ │
│ │          │  │                                             │  │ │                        │ │ │
│ │          │  │                                             │  │ │ **Budget residuo:**    │ │ │
│ │          │  │                                             │  │ │ Categoria interni:     │ │ │
│ │          │  │                                             │  │ │ €2.400 — stima scena   │ │ │
│ │          │  │                                             │  │ │ €1.800. Margine OK.    │ │ │
│ │          │  │                                             │  │ │                        │ │ │
│ │          │  │                                             │  │ │ Riserva: il costumista │ │ │
│ │          │  │                                             │  │ │ è in scena 11 fino     │ │ │
│ │          │  │                                             │  │ │ alle 14:00. Se girate  │ │ │
│ │          │  │                                             │  │ │ sc.12 nel pomeriggio   │ │ │
│ │          │  │                                             │  │ │ non ci sono conflitti. │ │ │
│ │          │  │                                             │  │ └────────────────────────┘ │ │
│ │          │  │                                             │  │                            │ │
│ │          │  │                                             │  ├────────────────────────────┤ │
│ │          │  │                                             │  │[Fattibile dmn?][Riduci €]  │ │
│ │          │  │                                             │  │[Scrivi dialog][Ottimizza▸] │ │
│ │          │  │                                             │  ├────────────────────────────┤ │
│ │          │  │                                             │  │ ┌──────────────────────┐   │ │
│ │          │  │                                             │  │ │ Scrivi a Cesare…     │   │ │
│ │          │  │                                             │  │ └──────────────────────┘   │ │
│ │          │  │                                             │  │                      [▶]   │ │
│ └──────────┘  └─────────────────────────────────────────────┘  └────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Streaming state** — what the Cesare bubble looks like while the response is being generated:

```
┌────────────────────────┐
│✦                       │
│ Sì, con una riserva.   │
│ Cast disponib···       │  ← ellipsis at the streaming cursor
└────────────────────────┘
```

---

### Mockup B — Breakdown page + Cesare with a cost-reduction conversation

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────┐  ┌──────────────────────────────────────────────┐ ┌────────────────────────────┐ │
│ │ SIDEBAR  │  │  Breakdown · Scena 12                         │ │ ✦ Cesare              [✕] │ │
│ │          │  │  INT. UFFICIO DEL DIRETTORE - GIORNO          │ │ Breakdown · Il Vuoto       │ │
│ │ Overview │  │                                               │ │ Dentro                     │ │
│ │ Writing  │  │  ┌────────────────────────────────────────┐   │ ├────────────────────────────┤ │
│ │ Sceneg.  │  │  │ CAST                              (3) │   │ │[📄 Scen.][🎬 Brkdn sc.12] │ │
│ │ Breakdn▾ │  │  │  ● Marco Rossi       Protagonista  ✓  │   │ │[💰 Budget] [📅 Schedule]  │ │
│ │  Scena   │  │  │  ● Silvia Moretti    Direttore     ✓  │   │ ├────────────────────────────┤ │
│ │  Progett │  │  │  ● Costumista        Giornaliero   ?  │   │ │                            │ │
│ │ Budget   │  │  └────────────────────────────────────────┘   │ │  ┌──────────────────────┐ │ │
│ │ Schedule │  │                                               │ │  │ Suggerisci come      │ │ │
│ │          │  │  ┌────────────────────────────────────────┐   │ │  │ riscrivere questa    │ │ │
│ │          │  │  │ PROPS                             (7) │   │ │  │ scena per ridurre    │ │ │
│ │          │  │  │  ● Scrivania ministeriale     (affitto)│   │ │  │ i costi          ◀  │ │ │
│ │          │  │  │  ● Telefono fisso anni '80    (acquist)│   │ │  └──────────────────┬─┘ │ │
│ │          │  │  │  ● Tappeto orientale XL       (affitto)│   │ │                     │   │ │
│ │          │  │  │  ● Quadri alle pareti (×4)    (rekwis.)│   │ │ ┌───────────────────▼──┐ │ │
│ │          │  │  │  ● Lampada da terra            (affitto)│   │ │ │✦                    │ │ │
│ │          │  │  │  ● Buste carta intestata      (consumo)│   │ │ │                     │ │ │
│ │          │  │  │  ● Valigia in pelle             (affitto)│   │ │ │ La scena ha tre     │ │ │
│ │          │  │  └────────────────────────────────────────┘   │ │ │ voci di costo alte: │ │ │
│ │          │  │                                               │ │ │                     │ │ │
│ │          │  │  ┌────────────────────────────────────────┐   │ │ │ 1. **Scrivania      │ │ │
│ │          │  │  │ LOCATION                          (1) │   │ │ │ ministeriale**       │ │ │
│ │          │  │  │  ● Ufficio direttore (set interno)  ✓  │   │ │ │ €480/giorno affitto  │ │ │
│ │          │  │  └────────────────────────────────────────┘   │ │ │ → Sostituire con     │ │ │
│ │          │  │                                               │ │ │ una scrivania neutra │ │ │
│ │          │  │  ┌────────────────────────────────────────┐   │ │ │ da ufficio taglia il │ │ │
│ │          │  │  │ STIMA COSTO SCENA                      │   │ │ │ costo a €120.        │ │ │
│ │          │  │  │  Props affitto:      €  980            │   │ │ │                     │ │ │
│ │          │  │  │  Cast giornaliero:   €  350            │   │ │ │ 2. **Tappeto XL**   │ │ │
│ │          │  │  │  Location set:       €  400            │   │ │ │ €220/giorno → rimuo- │ │ │
│ │          │  │  │  ─────────────────────────────         │   │ │ │ vere. L'ufficio è    │ │ │
│ │          │  │  │  Totale stima:       €1.730            │   │ │ │ minimalista se Marco │ │ │
│ │          │  │  │  Budget residuo cat: €2.400            │   │ │ │ entra convinto di    │ │ │
│ │          │  │  └────────────────────────────────────────┘   │ │ │ trovare qualcuno.   │ │ │
│ │          │  │                                               │ │ │                     │ │ │
│ │          │  │                                               │ │ │ 3. **Telefono anni  │ │ │
│ │          │  │                                               │ │ │ '80** €180 → basta  │ │ │
│ │          │  │                                               │ │ │ un telefono generico │ │ │
│ │          │  │                                               │ │ │ se non è in campo.  │ │ │
│ │          │  │                                               │ │ │                     │ │ │
│ │          │  │                                               │ │ │ **Riscrittura prop: │ │ │
│ │          │  │                                               │ │ │** "Marco entra in   │ │ │
│ │          │  │                                               │ │ │ un ufficio asettico  │ │ │
│ │          │  │                                               │ │ │ — lo spazio vuoto   │ │ │
│ │          │  │                                               │ │ │ dice tutto sul tipo │ │ │
│ │          │  │                                               │ │ │ che lo occupa."     │ │ │
│ │          │  │                                               │ │ │                     │ │ │
│ │          │  │                                               │ │ │ Risparmio potenziale│ │ │
│ │          │  │                                               │ │ │ **€880** (−51%).    │ │ │
│ │          │  │                                               │ │ └─────────────────────┘ │ │
│ │          │  │                                               │ │                          │ │
│ │          │  │                                               │ ├────────────────────────────┤ │
│ │          │  │                                               │ │[Fattibile dmn?][Riduci €]  │ │
│ │          │  │                                               │ │[Scrivi dialog][Ottimizza▸] │ │
│ │          │  │                                               │ ├────────────────────────────┤ │
│ │          │  │                                               │ │ ┌──────────────────────┐   │ │
│ │          │  │                                               │ │ │ Scrivi a Cesare…     │   │ │
│ │          │  │                                               │ │ └──────────────────────┘   │ │
│ │          │  │                                               │ │                      [▶]   │ │
│ └──────────┘  └───────────────────────────────────────────────┘ └────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Mockup C — Empty state (first open, no messages)

```
┌────────────────────────────┐
│ ✦ Cesare              [✕] │
│ Progetto · Il Vuoto Dentro │
├────────────────────────────┤
│[📄 Scen.][🎬 Brkdn]       │
│[💰 Budget] [📅 Schedule]  │
├────────────────────────────┤
│                            │
│                            │
│           ✦                │
│                            │
│      Ciao. Sono Cesare.    │
│    Chiedimi qualcosa       │
│    sulla produzione.       │
│                            │
│                            │
│                            │
├────────────────────────────┤
│[Fattibile dmn?][Riduci €]  │
│[Scrivi dialog][Ottimizza▸] │
├────────────────────────────┤
│ ┌──────────────────────┐   │
│ │ Scrivi a Cesare…     │   │
│ └──────────────────────┘   │
│                      [▶]   │
└────────────────────────────┘
```

---

### Mockup D — Context chip expanded

```
┌────────────────────────────┐
│ ✦ Cesare              [✕] │
│ Scena 12 · INT. UFFICIO   │
├────────────────────────────┤
│[📄 Scen. ▾] open ─────── │
│  87 scene · 12 personaggi │
│  Ultimo aggiornamento: 2h  │
│ ─────────────────────────  │
│[🎬 Brkdn sc.12][💰][📅]   │
└────────────────────────────┘
```

---

### Mockup E — Streaming indicator

```
┌────────────────────────────────────┐
│✦                                  │
│                                    │
│ La scena ha tre voci di costo      │
│ alte: la scrivania ministeriale,   │
│ il tappeto XL e il ···             │
│                                    │   ← "···" is the live streaming cursor
└────────────────────────────────────┘
```

---

## 6. Context Injection

When the user sends a message, the server assembles a `CesareContext` payload before calling the Anthropic API. The payload is built server-side — the client never touches production data directly.

### TypeScript interface

```typescript
// apps/web/app/features/predictions/cesare-chat.schema.ts

interface CesareContext {
  scene: {
    id: string;
    number: number;
    heading: string;
    content: string; // full Fountain text of the scene
    characters: string[]; // characters appearing in this scene
  } | null; // null when no specific scene is in scope

  screenplay: {
    title: string;
    totalScenes: number;
    characterVoices: Record<
      string,
      string[] // character name → their last 20 dialogue lines
    >;
  };

  breakdown: {
    sceneElements: BreakdownElement[]; // elements for the current scene
    categoryBudgets: Record<
      string, // category key (e.g. "cast", "props")
      { allocated: number; residual: number } // in cents
    >;
  } | null; // null when no breakdown data exists

  schedule: {
    shootingDays: ShootingDay[]; // all scheduled shooting days
    actorAvailability: Record<
      string, // actor name / element id
      string[] // ISO dates when unavailable
    >;
    locationBookings: Record<
      string, // location id
      string[] // ISO dates when booked
    >;
  } | null; // null when no schedule exists
}
```

### Context assembly rules

| User is on…                          | `scene`                    | `breakdown`                                  | `schedule`                |
| ------------------------------------ | -------------------------- | -------------------------------------------- | ------------------------- |
| Screenplay editor, scene selected    | Full scene data            | Elements for that scene, if breakdown exists | Full schedule, if defined |
| Screenplay editor, no scene selected | `null`                     | `null` (no scene scope)                      | Full schedule, if defined |
| Breakdown page, scene selected       | Scene heading + characters | Elements for that scene                      | Full schedule, if defined |
| Breakdown page, project view         | `null`                     | All elements aggregated                      | Full schedule, if defined |
| Budget page                          | `null`                     | All elements (for budget context)            | Full schedule, if defined |
| Schedule page                        | `null`                     | All elements (for scheduling context)        | Full schedule             |
| Any other page                       | `null`                     | `null`                                       | Full schedule, if defined |

The `screenplay.characterVoices` field is always populated when a screenplay exists — it is the key that enables voice-aware dialogue writing regardless of which page the user is on.

---

## 7. Streaming Architecture

Cesare chat responses stream word-by-word using the Anthropic Messages API with `stream: true`.

### Server function

```typescript
// apps/web/app/features/predictions/cesare-chat.server.ts

export const streamCesareMessage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      sceneId: z.string().uuid().nullable(),
      messages: z.array(MessageSchema), // conversation history (last N turns)
    }),
  )
  .handler(async ({ data }) => {
    await requireUser();
    // 1. withProjectAccess gate — "view" permission
    // 2. assembleCesareContext(db, data.projectId, data.sceneId)
    // 3. buildCesareChatPrompt(context, data.messages)
    // 4. anthropic.messages.stream(prompt)
    // 5. Return ReadableStream — TanStack Start pipes it to the client
  });
```

### Client-side streaming

The `useCesareChat` hook opens the stream via `fetch` and consumes it as a `ReadableStream`:

```typescript
// Pseudocode — actual implementation uses neverthrow ResultAsync
const response = await fetch(cesareChatEndpoint, {
  method: "POST",
  body: payload,
});
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  dispatch(actions.appendToken(decoder.decode(value)));
}
```

The abort signal from the stop button (`⬛`) is passed to `fetch` via `AbortController`.

### Why SSE is not used

TanStack Start's `createServerFn` returns a single response. Streaming is achieved by returning a `ReadableStream` directly from the handler and consuming it on the client with `fetch` + `ReadableStream`. No SSE infrastructure is needed. This pattern is consistent with how the Anthropic SDK's `stream()` method works.

---

## 8. Implementation Notes

### Feature folder

```
apps/web/app/features/predictions/
├── cesare-chat.schema.ts        ← CesareContext + MessageSchema + Zod schemas
├── cesare-chat.server.ts        ← streamCesareMessage server fn
├── cesare-context-assembler.ts  ← assembleCesareContext — pure DB queries
├── cesare-chat-prompt.ts        ← buildCesareChatPrompt — pure function
└── cesare-chat.errors.ts        ← CesareChatUnavailableError, ContextAssemblyError

apps/web/app/features/cesare/
├── components/
│   ├── CesareChatPanel.tsx          ← the drawer (React Aria useDialog)
│   ├── CesareChatPanel.module.css
│   ├── CesareMessage.tsx            ← single message bubble (user or Cesare)
│   ├── CesareMessage.module.css
│   ├── CesareContextChips.tsx       ← the row of context pills
│   ├── CesareContextChips.module.css
│   ├── CesareQuickPrompts.tsx       ← the 4 chip buttons
│   ├── CesareQuickPrompts.module.css
│   ├── CesareInput.tsx              ← textarea + send/stop button
│   ├── CesareInput.module.css
│   └── CesareFloatingButton.tsx     ← persistent ✦C button (bottom-right)
│   └── CesareFloatingButton.module.css
├── hooks/
│   ├── useCesareChat.ts             ← streaming state machine + dispatch
│   └── useCesareContext.ts          ← reads current scene/page context
└── index.ts
```

### Which pages mount the panel

The `CesareChatPanel` and `CesareFloatingButton` are mounted once at the project layout level (`_app.projects.$id.tsx`), not per-page. This lets the conversation persist when the user navigates between screenplay editor, breakdown, and schedule — the panel stays open.

The `useCesareContext` hook reads the current route params (sceneId from query params or route) and the current page type to determine what context to inject.

### Conversation history

The client maintains the conversation history in component state (`useCesareChat`). On each new message, the last `N` turns (default 10) are sent to the server as `messages: MessageSchema[]`. The server does not persist the conversation — it is ephemeral per browser session.

### Relation to Spec 17 server functions

The context assembler (`cesare-context-assembler.ts`) reuses the same DB query primitives as `cesare.server.ts` (Spec 17). The `characterVoices` extraction runs the same query as the screenplay scope loader in Spec 17, adding the last-20-lines filter.

### Mock mode

When `MOCK_AI=true`:

- `streamCesareMessage` returns a fixture response from `apps/web/mocks/cesare-chat-responses.ts`
- The fixture response streams character by character with a 15ms delay to simulate streaming
- One fixture per use case (feasibility, cost reduction, dialogue writing, schedule optimization)

---

## 9. CSS Notes

The panel is a right-side drawer. It slides in over the content (not beside it) because some pages (screenplay editor) cannot give up horizontal space.

Exception: on pages with a wide main content area and enough viewport width (>= 1400px), the layout shifts the main content left by 380px and the panel appears beside it rather than on top. This is the "liquid" variant.

```css
/* CesareChatPanel.module.css */
.panel {
  position: fixed;
  inset-block: 0;
  inset-inline-end: 0;
  inline-size: 380px;
  background: var(--color-surface);
  border-inline-start: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  z-index: var(--z-drawer);

  translate: 100% 0;
  transition: translate 200ms ease;

  &.isOpen {
    translate: 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel {
    transition: none;
  }
}
```

The user message bubble:

```css
.userMessage {
  align-self: flex-end;
  background: var(--color-accent);
  color: var(--color-on-accent);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  max-inline-size: 80%;
}
```

The Cesare message bubble:

```css
.cesareMessage {
  align-self: flex-start;
  background: var(--color-surface-elevated);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  max-inline-size: 90%;
  border-inline-start: 2px solid var(--color-accent);
}
```

The streaming ellipsis:

```css
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}

.streamingCursor {
  display: inline-block;
  animation: blink 1s ease infinite;
}

@media (prefers-reduced-motion: reduce) {
  .streamingCursor {
    animation: none;
  }
}
```

---

## 10. Accessibility

- The panel is a `<dialog>` role managed via React Aria `useDialog` and `useOverlay`
- Focus moves to the first focusable element (the close button) when the panel opens
- Focus returns to the trigger (floating button or toolbar item) when the panel closes
- `Escape` closes the panel
- The conversation area is `role="log"` with `aria-live="polite"` — screen readers announce new Cesare messages
- The streaming ellipsis is hidden from assistive technology (`aria-hidden="true"`) until streaming ends, at which point the full message is inserted into the `role="log"` container
- All interactive elements (close, send, stop, quick prompts, context chip toggles) use React Aria `useButton`

---

## 11. Open Questions

These questions are intentionally left unresolved. They require product and data decisions before implementation.

1. **Session persistence** — should the conversation history survive a page refresh? Currently ephemeral. Options: `sessionStorage`, server-side per-project chat log, or always ephemeral.

2. **Response storage** — should Cesare's answers be saved and searchable? A stored conversation could surface useful production decisions made with Cesare's help. Adds complexity (new DB table, search index).

3. **Coexistence with Spec 17 marker mode** — should opening the chat drawer automatically dismiss the Spec 17 status bar and inline markers, or should both be active simultaneously? Currently assumed: both can be active; no conflict.

4. **Character voice extraction depth** — "last 20 dialogue lines per character" is a heuristic. Does this capture voice adequately for protagonists with many lines? May need a smarter sample (first line, most recent lines, and a random sample of lines from the middle).

5. **Context token budget** — the full screenplay of an 87-scene film can be large. Should the context assembler truncate screenplay content to fit a token budget? If yes, what is the truncation strategy (scenes closest to the current scene first)?

6. **Multi-language responses** — the system prompt instructs Cesare to respond in Italian. Should the response language be a project-level setting for English-language projects?

---

## 12. Tests

Test file: `tests/cesare/cesare-chat.spec.ts`

| Tag     | Scenario                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| OHW-340 | Floating `✦C` button visible on all project pages                                                              |
| OHW-341 | `Cmd+Shift+A` opens and closes the panel                                                                       |
| OHW-342 | Panel opens with empty state message when no conversation exists                                               |
| OHW-343 | Context chips reflect the current page (screenplay page → 📄 chip active, 🎬 chip present if breakdown exists) |
| OHW-344 | Tapping a quick prompt chip pre-fills the textarea with the full question                                      |
| OHW-345 | Tapping a quick prompt chip twice sends the message immediately                                                |
| OHW-346 | Sending a message displays user bubble right-aligned, then Cesare streaming bubble                             |
| OHW-347 | Stop button (⬛) aborts streaming mid-response                                                                 |
| OHW-348 | Conversation history persists when user navigates from screenplay to breakdown page                            |
| OHW-349 | Context chip for 💰 Budget shows greyed-out state when project has no budget                                   |
| OHW-350 | Expanding a context chip shows the correct summary (scene count, character count, etc.)                        |
| OHW-351 | Text selection in screenplay editor → context menu → "Chiedi a Cesare" opens panel with scene pre-context      |

All tests run with `MOCK_AI=true`.

---

## 13. Files

### New

```
apps/web/app/features/predictions/cesare-chat.schema.ts
apps/web/app/features/predictions/cesare-chat.server.ts
apps/web/app/features/predictions/cesare-context-assembler.ts
apps/web/app/features/predictions/cesare-chat-prompt.ts
apps/web/app/features/predictions/cesare-chat.errors.ts
apps/web/app/features/cesare/components/CesareChatPanel.tsx
apps/web/app/features/cesare/components/CesareChatPanel.module.css
apps/web/app/features/cesare/components/CesareMessage.tsx
apps/web/app/features/cesare/components/CesareMessage.module.css
apps/web/app/features/cesare/components/CesareContextChips.tsx
apps/web/app/features/cesare/components/CesareContextChips.module.css
apps/web/app/features/cesare/components/CesareQuickPrompts.tsx
apps/web/app/features/cesare/components/CesareQuickPrompts.module.css
apps/web/app/features/cesare/components/CesareInput.tsx
apps/web/app/features/cesare/components/CesareInput.module.css
apps/web/app/features/cesare/components/CesareFloatingButton.tsx
apps/web/app/features/cesare/components/CesareFloatingButton.module.css
apps/web/app/features/cesare/hooks/useCesareChat.ts
apps/web/app/features/cesare/hooks/useCesareContext.ts
apps/web/mocks/cesare-chat-responses.ts
tests/cesare/cesare-chat.spec.ts                               ← OHW-340..351
```

### Modified

```
apps/web/app/routes/_app.projects.$id.tsx
  → mount CesareChatPanel + CesareFloatingButton at project layout level

apps/web/app/features/cesare/index.ts
  → export CesareChatPanel, CesareFloatingButton, useCesareChat

apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx
  → add context menu item "✦ Chiedi a Cesare su questa selezione"
```

### Unchanged

All Spec 17 files remain unchanged. This spec adds a new surface to Cesare; it does not modify the existing marker/popover/status-bar system.

---

## 14. Commit

```
[OHW] feat(cesare): production-aware chat panel (spec 29)
```

---

## 15. Document auto-generation (propose/accept)

Cesare can generate four narrative documents end-to-end via dedicated tools that emit DRAFT versions instead of overwriting the active text. The user reviews each draft in a banner above the editor and chooses to promote or discard it.

### Tools

| Tool                               | Source                     | Target document                   | Required input         |
| ---------------------------------- | -------------------------- | --------------------------------- | ---------------------- |
| `propose_logline_from_screenplay`  | Full screenplay            | `logline` (LOGLINE_MAX = 200)     | `instruction?`         |
| `propose_synopsis_from_screenplay` | Full screenplay            | `synopsis` (~400 words)           | `instruction?`         |
| `propose_soggetto_v2`              | Current `soggetto` content | `soggetto` (variant)              | `instruction`, `label` |
| `propose_scaletta_from_soggetto`   | Current `soggetto` content | `outline` (`OutlineContent` JSON) | `target_scene_count?`  |

Each tool loads the source content from PostgreSQL, calls Sonnet 4.6 with a specialised Italian system prompt, inserts a row in `document_versions` with `is_draft=true` and a label generated by `buildDraftLabel(docType, hint)`, and returns `{ ok: true, version_id, document_type, label, toast }`.

When `MOCK_AI=true` or `ANTHROPIC_API_KEY` is missing, the Sonnet call is replaced by canned `MOCK_OUTPUTS` so Vitest + mock-ui Playwright run deterministically.

### Schema

`document_versions.is_draft boolean NOT NULL DEFAULT false` — migration `0028_draft_versions.sql` (shared with `screenplay_versions`).

### UI — DraftBanner

`apps/web/app/features/documents/components/DraftBanner.tsx` is mounted at the top of the editor body inside `NarrativeEditor`. It queries `["document-drafts", documentId]` and renders one row per draft with:

- **Confronta** toggles a side-by-side line diff (`lib/diff-document.ts`, LCS-based).
- **Promuovi a attiva** atomically sets `is_draft=false`, sets `documents.currentVersionId = draft.id`, and mirrors `documents.content`.
- **Scarta** deletes the draft row.

All three actions go through `react-aria` buttons from `@oh-writers/ui`.

### Server fns

`apps/web/app/features/documents/server/drafts.server.ts` exposes `getDocumentDrafts`, `promoteDocumentDraft`, `discardDocumentDraft`. All three enforce `assertCanEdit` / `assertCanRead` against the project's membership.

### Tests

- **Vitest**: `apps/web/app/features/predictions/cesare-document-tools.test.ts` (19 cases), `apps/web/app/features/documents/lib/diff-document.test.ts` (5 cases).
- **Mock E2E**: `tests/cesare-agentic-documents-gen.spec.ts` — `[OHW-575]` logline, `[OHW-576]` synopsis, `[OHW-577]` soggetto v2, `[OHW-578]` scaletta.
- **Vernissage**: `vernissage/_stories/documents-auto-gen.story.json`, `vernissage/documents-auto-gen.md`.
