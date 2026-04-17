# Spec 04d — Rich Text Editor (Synopsis & Treatment)

Sub-spec di **04**. Logline resta `<textarea>` — troppo breve per giustificare un editor.

## Goal

Sostituire `<TextEditor>` (textarea) con un editor rich text per **synopsis** e **treatment**. Supporto per formatting base, word count live, e hook futuro per Cesare inline.

## Decisione: Tiptap

- Headless, CSS Modules-compatibile
- Extensions custom (word count, AI trigger)
- Non è Monaco — giusto per testo narrativo
- Portabile su mobile/Expo via wrapper futuro

Approvato da utente in sessione 2026-04-17.

## Out of scope

- Logline → resta textarea
- Outline → già gestito da `OutlineEditor` con drag-drop (04b)
- Markdown export → 04c
- AI inline (Cesare) → spec 17, ma editor deve esporre hook `onSelection` per trigger futuro
- Collaborazione Yjs real-time → colonna `yjs_state` resta inutilizzata per ora

## Stack delta

Aggiungere a `apps/web`:

```
@tiptap/react        (pinned)
@tiptap/starter-kit  (pinned)
@tiptap/extension-placeholder (pinned)
@tiptap/extension-character-count (pinned)
```

Approvazione utente richiesta prima di `pnpm add`.

## Data model

Invariato. `content` resta plain text nel DB — Tiptap salva HTML o JSON? **Decisione: HTML** (leggibile da export PDF, compatibile con `pdf-narrative.ts` esistente via strip-tags).

## Componente

`RichTextEditor` in `features/documents/components/RichTextEditor.tsx`.

Props:

```ts
interface RichTextEditorProps {
  value: string; // HTML string
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number; // via CharacterCount extension
  readOnly?: boolean;
  onSelectionChange?: (text: string) => void; // hook futuro Cesare
}
```

`NarrativeEditor` switcha su `RichTextEditor` per `synopsis` e `treatment`, mantiene `TextEditor` per `logline`.

## Extensions abilitate

| Extension        | Synopsis | Treatment |
| ---------------- | -------- | --------- |
| Bold, Italic     | ✓        | ✓         |
| Heading (H2, H3) | —        | ✓         |
| BulletList       | —        | ✓         |
| HardBreak        | ✓        | ✓         |
| Placeholder      | ✓        | ✓         |
| CharacterCount   | ✓ (5000) | —         |

## Migrazione contenuto esistente

Documenti esistenti hanno `content` come plain text. Al caricamento: se `content` non inizia con `<`, wrappare in `<p>content</p>` prima di passare a Tiptap.

## CSS

`RichTextEditor.module.css` — styling del `.ProseMirror` container. Nessun stile inline, nessun override di Tiptap default via JS.

## Tests (Playwright)

| ID      | Scenario                                                                      |
| ------- | ----------------------------------------------------------------------------- |
| OHW-220 | Synopsis: bold shortcut (Cmd+B) applica formatting, persiste dopo save+reload |
| OHW-221 | Treatment: heading H2 visibile dopo save+reload                               |
| OHW-222 | Synopsis: counter CharacterCount aggiorna live                                |
| OHW-223 | Viewer: editor in readOnly, nessun input accettato                            |
| OHW-224 | Migrazione: documento plain text esistente carica senza errori in Tiptap      |

## PDF export

`pdf-narrative.ts` passa il content diretto a PDFKit via `writeBody`. Con Tiptap il content è HTML → PDFKit stamperebbe i tag come testo grezzo.

Fix: aggiungere `stripHtml(content: string): string` in `pdf-narrative.ts` che rimuove i tag HTML prima di `writeBody`. Nessuna dipendenza esterna — regex semplice sufficiente per questo caso d'uso (no script injection risk lato server).

## Implementation order

1. `pnpm add` dipendenze Tiptap
2. `RichTextEditor.tsx` + `.module.css`
3. Switch in `NarrativeEditor` per synopsis/treatment
4. Migrazione plain→HTML al load (`toTiptapHtml` helper)
5. `stripHtml` in `pdf-narrative.ts` + update `writeBody` call
6. Test E2E OHW-220..224
7. Update spec 04 ✅ già fatto
