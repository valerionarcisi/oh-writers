# Spec 04e — Narrative Editor on vanilla ProseMirror

Sub-spec di **04**. Sostituisce la scelta di Tiptap presa in **04d**.

## Goal

Sostituire `RichTextEditor` (Tiptap) per **synopsis** e **treatment** con un editor basato sullo stesso pattern dello screenplay editor: vanilla ProseMirror montato imperativamente in un ref, isolato dai re-render React. Allineare anche il look "foglio" al pattern dello screenplay (page shell bianco su fondo scuro).

Logline resta `<textarea>`. Outline resta `OutlineEditor`. Nessun cambiamento al data model — `content` resta HTML-string nel DB.

## Why

Le tre regressioni filate il 2026-04-17 (`docs/BUGS.md` BUG-001, BUG-002, BUG-003) hanno tutte la stessa firma sospettata: il flusso `onUpdate → setContent padre → re-render → useEditor → setOptions/updateState` di Tiptap su React 19 perde transazioni o resetta lo stato. Sei round di fix cosmetici (memoize extensions, callback refs, `shouldRerenderOnTransaction`, ecc.) non hanno risolto sulla macchina di Valerio.

Lo screenplay editor non soffre di questa classe di bug perché:

- monta `EditorView` una sola volta in un `useEffect[readOnly]`
- tutto il flusso scrittura passa via `dispatchTransaction` → `view.updateState`, mai via stato React
- il padre comunica con l'editor solo via handle imperativo restituito da `onReady(view)`

Questa spec applica lo stesso pattern al narrative editor.

## Decisione

Approvata da Valerio in sessione 2026-04-18: si va con **A** (riuso del pattern, non del componente).

## Out of scope

- Schema PM dello screenplay (heading/action/dialogue) — il narrative ha schema proprio
- Yjs / collaborazione real-time (già out of scope per 04d)
- Hook AI inline (Cesare) — resta da spec 17
- Qualsiasi modifica a logline e outline

## Stack delta

**Aggiungere**: nessuna nuova dipendenza. `prosemirror-state`, `-view`, `-model`, `-history`, `-keymap`, `-commands`, `-inputrules`, `-schema-list` sono già in `apps/web` per lo screenplay editor.

**Rimuovere** (a fine refactor, in commit separato):

```
@tiptap/react
@tiptap/starter-kit
@tiptap/extension-placeholder
@tiptap/extension-character-count
```

## Data model

Invariato. `content` resta HTML string. La migrazione plain-text → HTML già fatta in 04d resta valida.

## Schema PM narrativo

`features/documents/lib/narrative-schema.ts` — schema minimale, distinto dallo schema screenplay.

Nodi:

```
doc
├── paragraph (default block)
├── heading   (attrs: { level: 2 | 3 })   — solo se enableHeadings=true
├── bullet_list
│   └── list_item
│       └── paragraph
└── (inline: text, hard_break)
```

Marks: nessuna per ora (no bold/italic). Coerente con quanto c'è in 04d per synopsis (no formatting inline) e treatment (solo block-level: H2/H3/lista). Si potrà aggiungere `strong`/`em` in spec successiva se l'utente lo richiederà.

## Plugins

`features/documents/lib/narrative-plugins.ts`:

| Plugin              | Cosa fa                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `history()`         | Undo/redo                                                                   |
| `keymap` baseline   | `Enter` (split block), `Backspace`/`Delete` sicuri (no node-selection trap) |
| `keymap` undo/redo  | `Mod-z`, `Mod-Shift-z`, `Mod-y`                                             |
| `keymap` lista      | `Tab` / `Shift-Tab` per `sinkListItem` / `liftListItem` (solo treatment)    |
| `inputrules`        | `- ` o `* ` a inizio riga → bullet list (solo treatment)                    |
| `placeholderPlugin` | Decoration sul primo blocco vuoto, contenuto dal prop `placeholder`         |

Niente plugin pagina (quello dello screenplay è specifico per le 8.5×11"); il narrative misura caratteri/parole per il counter.

## Componenti

### `NarrativeProseMirrorView.tsx`

Stesso pattern di `ProseMirrorView.tsx`:

```ts
interface NarrativeProseMirrorViewProps {
  value: string; // HTML
  onChange: (html: string) => void;
  onSelectionChange?: (text: string) => void;
  onReady?: (view: EditorView) => void;
  placeholder?: string;
  enableHeadings?: boolean; // true = treatment, false = synopsis
  readOnly?: boolean;
}
```

- Un solo `useEffect[readOnly, enableHeadings]` (re-mount se cambia il preset)
- `value` esterno applicato via `useEffect` separato che diffa con `lastValueRef.current` (stesso meccanismo dello screenplay)
- `dispatchTransaction` aggiorna `view.updateState`, serializza `view.state.doc` a HTML via `prosemirror-model`'s `DOMSerializer.fromSchema(schema).serializeFragment` → `XMLSerializer`
- Espone `__ohWritersNarrativeHtml()` su `window` per gli E2E

### `NarrativeEditor.tsx` — modifiche

- Sostituisce `<RichTextEditor>` con `<NarrativeProseMirrorView>`
- Mantiene la toolbar H2/H3/Lista (solo treatment) ma i `onClick` chiamano comandi sulla `view` tenuta in un ref locale, popolata dall'`onReady` callback
- Lo stato `content` resta `useState` per il counter, ma viene aggiornato da `onChange` debounced (250ms) per non re-renderare a ogni tasto. L'autosave debounce esistente (`useAutoSave`) rimane sopra
- Il counter footer esce da `editorMain` scrollabile e diventa una riga `auto` del grid `.page` → fix BUG-002

### File da eliminare

- `apps/web/app/features/documents/components/RichTextEditor.tsx`
- `apps/web/app/features/documents/components/RichTextEditor.module.css`

## CSS — look "pagina"

`NarrativeEditor.module.css`:

- `.editorArea` → fondo scuro tipo screenplay (`background: var(--color-bg)` o un grigio dedicato), `padding-block: var(--space-8)`, scroll qui
- Nuovo `.pageShell` → max-inline-size ~720px (più stretto delle 816px dello screenplay perché qui il testo è prosa, non monospace), background `#ffffff`, `box-shadow: var(--shadow-md)`, `padding: var(--space-8) var(--space-10)`, `border-radius: var(--radius-md)`
- `.pageShell .ProseMirror` → tipografia leggibile (serif o stack di sistema scelto in `tokens`), `line-height: 1.6`, `font-size: var(--text-base)`, niente `caret-color` override
- Counter footer fuori da `.editorArea`, riga separata del grid `.page`

`prefers-reduced-motion` rispettato (nessuna animazione introdotta).

## Migrazione

Decisione 2026-04-18: nessuna migrazione dei contenuti esistenti. I documenti synopsis/treatment salvati da Tiptap nel DB di sviluppo vengono **cancellati e rigenerati** vuoti dal seeder. Il refactor non porta logica di migrazione.

Script: aggiungere `pnpm db:reset:narrative` (o equivalente), o riuso del seeder di test che già azzera i contenuti.

## Tests (TDD — Playwright)

Si scrivono **prima** dell'implementazione e devono fallire sull'`HEAD` corrente.

| ID         | Scenario                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| OHW-EDR-01 | Treatment vuoto → digita "primo paragrafo" → premi `End` → premi `Enter` → conta 2 `<p>` nel DOM, caret nel secondo    |
| OHW-EDR-02 | Treatment → click su "• List" → il blocco corrente diventa `<ul><li>`, bottone `.active`. Riclick → torna a `<p>`      |
| OHW-EDR-03 | Synopsis e Treatment → counter "characters" e "~pages" hanno `boundingBox().y < window.innerHeight` (visibili a video) |

Fixture: utente con permessi editor sul progetto. Vedi `reference-test-infrastructure` in memoria per il pattern (Giuseppe / Maria).

Smoke test rimasti da 04d (`OHW-220..224`) — quelli ancora applicabili (placeholder, character count, readOnly, migrazione) restano. Bold/Italic shortcuts (`OHW-220`) **vengono rimossi** dalla suite: lo schema narrativo non supporta marks inline.

## Implementation order

1. **Spec approvata** ← punto di blocco
2. `narrative-schema.ts` + `narrative-plugins.ts` + helpers `htmlToDoc` / `docToHtml` + unit test Vitest sui transformer
3. `NarrativeProseMirrorView.tsx` minimale (no toolbar, no counter)
4. **E2E OHW-EDR-01..03** scritti, verifica che falliscono se applicati al `RichTextEditor` corrente (sanity check sul test)
5. Switch in `NarrativeEditor` da `RichTextEditor` a `NarrativeProseMirrorView`, toolbar via ref, counter footer fuori dallo scroll, nuovo CSS pagina
6. E2E OHW-EDR-01..03 verdi
7. Aggiorna E2E esistenti (`OHW-220..224`) → rimuovi i marks inline, mantieni gli altri verdi
8. Rimuovi file Tiptap + dipendenze (`pnpm remove ...`) in commit separato
9. Aggiorna `docs/BUGS.md` (BUG-001..003 → fixed) + spec `04` + `04d` (rimando a 04e) + `architecture.md` se serve + `README.md` con la TODO/DONE list aggiornata
10. **Commit unico finale** (decisione utente 2026-04-18): un solo commit `[OHW] feat: narrative editor su ProseMirror` con codice + rimozione Tiptap + aggiornamento docs + README todolist + BUGS.md.

## Risks

- **DOMParser PM** può perdere contenuto da HTML "sporco" salvato in passato. Mitigazione: prima di switchare, dump degli HTML in DB di sviluppo e check manuale che `htmlToDoc → docToHtml` sia idempotente sui campioni. Se non lo è, aggiungere normalizer dedicato.
- **SSR** — `EditorView` richiede DOM. Stesso pattern dello screenplay editor: `useEffect` lato client, niente render-time PM.
- **Placeholder via decoration** — stile diverso da quello Tiptap. Cosmetico, da tarare in CSS.

## Definition of Done

- 3 nuovi E2E verdi in CI
- E2E ereditati da 04d (post-rimozione marks) verdi
- `docs/BUGS.md` aggiornato (i 3 bug archiviati come "Fixed in spec 04e")
- `README.md` con TODO/DONE list aggiornata (regola end-of-task ritual)
- Nessuna dipendenza `@tiptap/*` in `apps/web/package.json`
