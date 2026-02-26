# Spec 05d — Autocomplete UX (Style, Tab Accept, Transitions)

## Context

Spec 05b shipped character and scene heading autocomplete. Two UX problems remain:

1. **Tab doesn't reliably accept** the first suggestion — writers expect Tab to confirm and move on
2. **The suggest widget is visually broken** — Monaco's default widget uses blue selection, dark-grey background, and rounded corners that clash with the brutalist dark theme
3. **Transitions are not autocompleted** — FADE IN:, CUT TO: etc. are standard Fountain elements that should be suggested

---

## Feature 1 — Tab Accepts First Suggestion

### Behaviour

When the suggest widget is open:

- Tab must accept the currently highlighted suggestion
- The first suggestion is always pre-highlighted (no need to press Down first)
- Icons in the widget are hidden (brutalist style — text only)

### Implementation

**`apps/web/app/features/screenplay-editor/components/MonacoWrapper.tsx`**

Add to the `options` object:

```ts
acceptSuggestionOnTab: 'on',    // Tab accepts the highlighted suggestion
suggestSelection:      'first', // always auto-highlight the first item
suggest: { showIcons: false },  // hide kind icons — text only
```

---

## Feature 2 — Styled Suggest Widget

### Behaviour

The suggest widget must match the editorial dark theme:

| Property           | Value                                 |
| ------------------ | ------------------------------------- |
| Background         | `#1a1917` (`--color-surface`)         |
| Border             | `#2e2d2a` (`--color-subtle`)          |
| Default text       | `#c8c5be` (`--color-gray-700`)        |
| Selected row bg    | `#2e2d2a` (`--color-subtle`)          |
| Selected row text  | `#f0ede6` (`--color-fg`)              |
| Matched characters | `#d4a843` (amber accent)              |
| Border-radius      | 0 (brutalist — no rounding anywhere)  |
| Font               | `--font-sans` (Inter) — not monospace |
| Font size          | `--font-size-sm` (13px)               |

### Implementation

**`apps/web/app/features/screenplay-editor/lib/fountain-language.ts`**

Add widget colour keys to `colors` inside `defineTheme('fountain-dark', ...)`:

```ts
'editorSuggestWidget.background':               COLORS.bgSurface,
'editorSuggestWidget.border':                   COLORS.selection,
'editorSuggestWidget.foreground':               COLORS.action,
'editorSuggestWidget.selectedBackground':       COLORS.selection,
'editorSuggestWidget.selectedForeground':       COLORS.character,
'editorSuggestWidget.highlightForeground':      COLORS.sceneHeading,
'editorSuggestWidget.focusHighlightForeground': COLORS.sceneHeading,
'list.activeSelectionBackground':               COLORS.selection,
'list.activeSelectionForeground':               COLORS.character,
'list.hoverBackground':                         COLORS.bg,
'list.focusBackground':                         COLORS.selection,
'list.highlightForeground':                     COLORS.sceneHeading,
```

**`apps/web/app/styles/global.css`**

Append global overrides for border-radius and font (Monaco injects its widget outside the React tree, so CSS Modules cannot reach it):

```css
.monaco-editor .suggest-widget {
  border-radius: 0 !important;
  font-family: var(--font-sans) !important;
  font-size: var(--font-size-sm) !important;
}
.monaco-editor .suggest-widget .monaco-list .monaco-list-row {
  border-radius: 0 !important;
}
```

---

## Feature 3 — Transition Autocomplete

### Behaviour

When typing an all-caps line at column 0 (action position, no indent) that is not a scene heading, Monaco suggests standard Fountain transitions:

- `FADE IN:`
- `FADE OUT:`
- `CUT TO:`
- `SMASH CUT TO:`
- `DISSOLVE TO:`
- `MATCH CUT TO:`
- `JUMP CUT TO:`

Monaco filters the list by the typed prefix automatically. The user types "F" → sees "FADE IN:" and "FADE OUT:".

### Trigger Conditions

- Line has no leading indent (`lineContent === lineContent.trimStart()`)
- Line does not start with a scene heading prefix (`INT.`, `EXT.`, `I/E`)
- Line is empty or fully uppercase (allows triggering on an empty line or mid-word)

### Implementation

**`apps/web/app/features/screenplay-editor/lib/fountain-autocomplete.ts`**

Add constant:

```ts
const FOUNTAIN_TRANSITIONS = [
  "FADE IN:",
  "FADE OUT:",
  "CUT TO:",
  "SMASH CUT TO:",
  "DISSOLVE TO:",
  "MATCH CUT TO:",
  "JUMP CUT TO:",
];
```

Add third branch in `provideCompletionItems` (after character and scene heading checks):

```ts
const isAtRoot = lineContent === lineContent.trimStart();
const isSceneStart = /^(?:INT\.|EXT\.|I\/E)/.test(lineContent.trimStart());
const trimmedLine = lineContent.trim();
const isAllCaps =
  trimmedLine.length === 0 || trimmedLine === trimmedLine.toUpperCase();

if (isAtRoot && !isSceneStart && isAllCaps) {
  const range = {
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };
  return {
    suggestions: FOUNTAIN_TRANSITIONS.map((t) => ({
      label: t,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: t,
      range,
    })),
  };
}
```

---

## Tests

| Tag     | Description                                                                 |
| ------- | --------------------------------------------------------------------------- |
| OHW-060 | Tab on character line with suggestion visible → accepts first suggestion    |
| OHW-070 | Suggest widget background is dark, no rounded corners                       |
| OHW-071 | Transition autocomplete: typing "F" on empty action line shows FADE options |
| OHW-072 | Transition autocomplete: Tab accepts first transition                       |

---

## Scope — Not In This Spec

- Parenthetical autocomplete (not needed — short, standardised)
- Dialogue autocomplete (free text — no suggestions)
