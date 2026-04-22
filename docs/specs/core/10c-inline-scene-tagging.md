# Spec 10c — Inline scene tagging in middle column

> **Status:** implemented (2026-04-21)
> **Depends on:** Spec 10 (Breakdown), Spec 05 (Screenplay editor / ProseMirror)
> **Date:** 2026-04-21

## Goal

Trasformare la colonna centrale del Breakdown da una vista solo-heading + note (`SceneScriptViewer`) in un **reader read-only dell'intera sceneggiatura**, basato sullo stesso engine ProseMirror dell'editor, dove:

- le occorrenze già taggate sono evidenziate inline con background color per categoria (pattern Movie Magic / StudioBinder / Filmustage),
- le suggestion pending di Cesare appaiono come "ghost" inline (bordo dashed + ✨),
- l'utente può **selezionare testo arbitrario** e taggarlo via toolbar fluttuante (14 categorie),
- la TOC scene del pannello sinistro fa scroll-to-scene nel reader.

Niente migration DB, niente nuove server function: si riusa `screenplay_versions.content` come snapshot, `useAddBreakdownElement` per i tag.

## Non-goals (Spec 10c)

Vedi sezione "Out of scope" in fondo. In sintesi: niente edit inline del testo, niente multi-select, niente drag-to-tag, niente sync real-time del reader, niente Expo.

## Architecture

### Componenti nuovi

```
apps/web/app/features/screenplay-editor/components/
  ReadOnlyScreenplayView.tsx        # wrapper PM read-only riusabile

apps/web/app/features/breakdown/components/
  ScriptReader.tsx                  # rinomina + riscrittura di SceneScriptViewer
  ScriptReader.module.css
  SelectionToolbar.tsx              # toolbar fluttuante 14 categorie
  SelectionToolbar.module.css

apps/web/app/features/breakdown/lib/pm-plugins/
  highlight-decoration.ts           # plugin: decora occurrences accepted
  ghost-decoration.ts               # plugin: decora suggestions pending
  selection-toolbar.ts              # PluginView: monta React portal toolbar
  scene-anchors.ts                  # helper: pos→scene + scrollToScene
```

### Pattern

- **`ReadOnlyScreenplayView`** vive in `features/screenplay-editor/components/` (riusabile da altre feature). Accetta `{ content: string, pluginsExtra: Plugin[], onReady?: (view: EditorView) => void, className?: string }`. Internamente:
  - usa lo stesso `schema` e `fountainToDoc` di `ProseMirrorView`,
  - costruisce `EditorState` con `editable: () => false`,
  - include solo plugin "lettura" (heading nodeView, paginator se compatibile read-only),
  - applica `pluginsExtra` ricevuti dal consumer.

- **`ScriptReader`** (breakdown) wrappa `ReadOnlyScreenplayView` e fornisce i 3 plugin breakdown-specific (highlight, ghost, selection toolbar).

- **Snapshot rendering**: il reader parsa `screenplay_versions.content` (fountain string) una sola volta per `version.updatedAt` cambiato. Niente live sync con la pagina Screenplay (v1).

## Components

### 1. `ReadOnlyScreenplayView` (screenplay-editor)

Sibling pulito di `ProseMirrorView`:

```tsx
type Props = {
  content: string; // fountain
  pluginsExtra?: Plugin[];
  onReady?: (view: EditorView) => void;
  className?: string;
};
```

Costruisce un `EditorView` con `editable: () => false`, riusa `fountainToDoc`, monta heading nodeView, espone l'istanza via `onReady` per consentire al consumer di chiamare `view.dispatch` (per scroll, selezione).

### 2. `ScriptReader` (breakdown)

Sostituisce `SceneScriptViewer`. Riceve:

```tsx
type Props = {
  projectId: string;
  versionId: string;
  versionContent: string; // screenplay_versions.content
  versionUpdatedAt: string;
  elements: BreakdownElementWithOccurrences[];
  suggestions: CesareSuggestion[];
  canEdit: boolean;
  onScrollSceneChange?: (sceneIndex: number) => void;
};
```

Costruisce i 3 plugin breakdown (highlight + ghost + selection toolbar — quest'ultimo solo se `canEdit`) e li passa a `ReadOnlyScreenplayView`. Cattura `view` via `onReady` per esporre `scrollToScene(index)` tramite `useImperativeHandle`.

### 3. `SelectionToolbar`

Componente React montato via Portal dal plugin `selection-toolbar`. Mostra 14 bottoni categoria (cast, prop, location, vehicle, vfx, sfx, sound, costume, makeup, set-dressing, animal, stunt, music, extra). Click → chiama `onTag(category, selectedText, sceneId)` → invoca `useAddBreakdownElement.mutate(...)` (stesso path di oggi). ESC → dismiss.

Posizionamento: sopra la selezione, con flip se vicino al bordo. Touch-friendly per iPad.

### 4. Plugin PM

- **`highlight-decoration.ts`** — derivato da `elements`. Per ogni occurrence trova range nel doc (full-scan v1, case-insensitive, word-boundary), produce `Decoration.inline(from, to, { class: styles.highlight, 'data-cat': cat, 'data-stale': isStale })`.
- **`ghost-decoration.ts`** — derivato da `suggestions` pending. `Decoration.inline` con classe `ghost` (bordo dashed) + widget ✨ a fianco. Click apre popover Accept/Ignore (riusa pattern Cesare esistente).
- **`selection-toolbar.ts`** — `PluginView` che osserva `view.state.selection`. Quando non vuota e `canEdit`, monta `<SelectionToolbar />` via React Portal con coordinate `view.coordsAtPos(from)`.
- **`scene-anchors.ts`** — utility pure: `findSceneNodePosition(doc, sceneIndex)` + `scrollToScene(view, index)` che chiama `view.dispatch` con scroll into view.

## Data flow

1. `BreakdownPage` carica `version` (con `content`), `elements`, `suggestions` via TanStack Query (già esistente).
2. Passa tutto a `<ScriptReader />`.
3. `ScriptReader` costruisce i plugin e renderizza `<ReadOnlyScreenplayView />`.
4. Quando l'utente seleziona testo → toolbar appare → click su categoria → `useAddBreakdownElement.mutate(...)` → invalidate query → re-render con highlight nuovo.
5. Quando l'utente clicca scena nella TOC sinistra → `scriptReaderRef.current.scrollToScene(index)`.
6. Re-match: full-scan a ogni cambio di `elements` (v1). Optimization in spec futura.

## CSS tokens

Aggiungere in `packages/ui/src/styles/tokens.css`:

```css
--cat-cast-bg: oklch(from var(--cat-cast) l c h / 0.18);
--cat-prop-bg: oklch(from var(--cat-prop) l c h / 0.18);
/* ... una per ognuna delle 14 categorie ... */
```

I `--cat-*` (foreground) esistono già da Spec 10.

## Permissions

- Viewer (team role `viewer`, o owner di personal): vede highlight + ghost. Selection toolbar **non montata** (`canEdit=false`).
- Editor / Owner: tutto attivo.

Riusa `canEditBreakdown` da `features/breakdown/lib/permissions.ts`.

## Migration & rollout

6 step, un commit per step:

1. **Token CSS `--cat-*-bg`** in `packages/ui/src/styles/tokens.css`. Commit standalone.
2. **`ReadOnlyScreenplayView`** + Vitest minimo (renderizza fountain in DOM read-only).
3. **`scene-anchors.ts`** + Vitest (`findSceneNodePosition`).
4. **`highlight-decoration.ts`** + `ghost-decoration.ts` + Vitest sui core puri (`findOccurrencesInDoc`, `mapSuggestionsToRanges`).
5. **`SelectionToolbar`** component + `selection-toolbar.ts` plugin + Vitest TL sul componente.
6. **Big-bang in `BreakdownPage.tsx`**: rimuovi `SceneScriptViewer`, monta `ScriptReader`, cabla `scrollToScene` dalla TOC. Playwright E2E in stesso commit (~100 LOC rimosse, ~30 aggiunte in BreakdownPage).

## Risks

- **Paginator in read-only**: il plugin paginator esistente potrebbe assumere editor mutabile. Mitigation: in `ReadOnlyScreenplayView` provarlo, se rompe disabilitarlo (la paginazione è cosmetica nel reader breakdown).
- **`fountainToDoc` fallisce**: fallback a `<pre>{content}</pre>` con banner "rendering avanzato non disponibile, modalità testo".
- **Ghost popover vs selection toolbar collision**: priority esplicita — se selezione attiva, ghost popover si chiude.
- **Scroll debounce**: `onScrollSceneChange` debounced 150ms per evitare thrashing della TOC.
- **Performance full-scan**: su sceneggiature >120 pagine può laggare. Profilare; se necessario, spec futura per indice incrementale.

## Testing

### Vitest unit (cores puri)

- `findOccurrencesInDoc(doc, elements)` — case-insensitive, word-boundary, `isStale` preservato.
- `mapSuggestionsToRanges(doc, suggestions)` — range invalidi scartati, sovrapposizione → highlight vince.
- `findSceneNodePosition(doc, sceneIndex)` — indice valido / fuori range / doc vuoto.
- Reducer `selection-toolbar-state` — `setSelection` / `clear`.

### Vitest + Testing Library

- `SelectionToolbar.test.tsx` — 14 bottoni, click → callback, ESC → dismiss.

### Playwright E2E (`tests/breakdown/inline-tagging.spec.ts`)

- `[OHW-280]` select text → tag as Cast → highlight + chip nel pannello destro. **(known-failing: dblclick non commit a TextSelection PM in headless Chromium; il toolbar non appare in alcuni run. Da rivedere con un trigger manuale di selezione PM.)**
- `[OHW-281]` viewer non vede toolbar (toolbar plugin disabilitato per ruolo VIEWER).
- `[OHW-282]` TOC click → scroll-to-scene (selettore `.pm-heading`, threshold y < 600).
- `[OHW-283]` stale occurrence renders dimmed (`data-stale="true"`).
- `[OHW-284]` ghost ha `data-ghost="true"` + `data-cat` + `data-occurrence-id`.
- `[OHW-285]` ghost click → popover → Accept rimuove `data-ghost` (diventa highlight).
- `[OHW-286]` ghost click → popover → Ignore rimuove ghost.
- `[OHW-287]` reader scroll aggiorna l'item attivo nella TOC. Il listener si aggancia a tutti gli ancestor con `overflow-y: auto|scroll` + `window` capture (defensive). Quando `findSceneIndexAtPos` restituisce un indice > `scenes.length` (PM può avere più heading nodes della tabella `scenes` in DB), si clamp all'ultima scena nota per evitare che `setActiveSceneId(null)` faccia fallback a `scenes[0]`.

### Seed fixtures

`packages/db/src/seed/fixtures/breakdown-fixtures.ts` aggiunge anche occorrenze **pending** (oltre alle accepted) per il team project, così OHW-285/286 trovano sempre `data-ghost="true"` da cliccare. Il seed usa `onConflictDoUpdate` per restare idempotente.

## Out of scope (rimandato a spec successive)

- Editing inline del testo scena (resta su pagina Screenplay).
- Re-match incrementale ottimizzato (Web Worker, indice).
- Multi-selezione di occorrenze.
- Drag-to-tag dal pannello destro al testo.
- Auto-tagging Cesare-driven di scene heading / personaggi parlanti (10d?).
- Annotazioni / commenti inline (feature trasversale).
- Sync real-time del reader con altre tab (Yjs collab).
- Mobile companion (Expo) — pattern diverso (long-press + bottom sheet).
- Undo/redo dei tag inline.
