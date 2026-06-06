# Spec 65 — Inline formatting (bold/italic) on the narrative editors

Add **bold** and _italic_ to the narrative prose editors. Today the schema is
intentionally mark-less (Spec 04e) and only the Treatment has a toolbar (H2/H3/•
List). This adds the two inline marks + the toolbar controls to **Soggetto,
Sinossi AND Trattamento** — the same fixed toolbar pattern across all three.

## Behaviour

- Two inline marks: **bold** (`strong`, `⌘/Ctrl+B`) and _italic_ (`em`,
  `⌘/Ctrl+I`).
- A **fixed toolbar above the editor** on Soggetto, Sinossi, Trattamento. The
  Treatment keeps its H2/H3/• List buttons; **B** and _I_ are prepended to all
  three. Buttons reflect the active mark at the caret/selection (`aria-pressed`).
- Marks round-trip through HTML (`<strong>` / `<em>`) so they persist on save and
  re-open — `narrative-html.ts` already serialises via the schema, so adding the
  marks' `parseDOM`/`toDOM` is enough.

## Implementation

- **Schema** (`narrative-schema.ts`): add a shared `marks` map with `strong`
  (`<strong>`/`<b>`/`font-weight`) and `em` (`<em>`/`<i>`/`font-style:italic`) to
  BOTH `synopsisSchema` and `treatmentSchema` (so Soggetto/Sinossi get them too).
- **Commands** (`narrative-commands.ts`, new or alongside existing helpers):
  `toggleStrong` / `toggleEm` via `toggleMark`, and `isMarkActive` for the
  button pressed-state.
- **Keymap**: extend the narrative editor keymap with `Mod-b → toggleStrong`,
  `Mod-i → toggleEm` (in `narrative-plugins`/the editor keymap).
- **Toolbar**: `NarrativeEditor` renders B / I before the existing controls. The
  free editor used by Soggetto (`FreeNarrativeEditor` →
  `NarrativeProseMirrorView`) gains the same fixed toolbar (a small shared
  toolbar component so the three editors don't fork). It needs the
  `EditorView` to dispatch commands — expose it via the existing `onReady`.
- Reuse the Treatment toolbar styles (`editorToolbar` / `editorToolbarBtn` /
  `editorToolbarBtnActive`) so the look is identical.

## Tests

- Unit: `toggleStrong`/`toggleEm` toggle the mark on a selection; `isMarkActive`
  reports the caret mark. HTML round-trip: a doc with `<strong>`/`<em>` parses
  and re-serialises losslessly (`narrative-html.test.ts`).
- E2E (`OHW-065`, when asked): select text on Soggetto → click B → the text is
  bold and persists across reload; `⌘I` italicises; Trattamento keeps H2/H3/List.
