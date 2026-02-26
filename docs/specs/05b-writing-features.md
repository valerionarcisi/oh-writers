# Spec 05b — Writing Features: Smart Keybindings, Autocomplete, Live Page Position

## Context

Spec 05 (Screenplay Editor) shipped the Monaco editor with Fountain tokenizer and Tab cycling. This spec covers the remaining writing-experience features before moving to breakdown (Spec 10).

**Not in this spec:** PDF export (Spec 08), real-time collaboration (Spec 09), scene breakdown (Spec 10).

---

## User Stories

- As a writer, pressing Enter after a CHARACTER line should automatically start a DIALOGUE line so I never have to think about formatting
- As a writer, pressing Enter after a DIALOGUE line should return to ACTION so the flow is natural
- As a writer, I want character names I've already used to appear as autocomplete suggestions when I'm on a character line
- As a writer, I want scene locations I've already used to appear as suggestions when I type INT. or EXT.
- As a writer, I want to know exactly which page I'm on as I type, not just the total page count

---

## Feature 1 — Smart Enter Keybindings

### Behavior

| Current line type                            | After pressing Enter | New line                           |
| -------------------------------------------- | -------------------- | ---------------------------------- |
| CHARACTER (6-space indent, UPPERCASE)        | Enter                | DIALOGUE (10-space indent)         |
| DIALOGUE (10-space indent)                   | Enter                | ACTION (no indent)                 |
| PARENTHETICAL `(...)` at dialogue indent     | Enter                | DIALOGUE (same 10-space indent)    |
| SCENE HEADING (`INT.` / `EXT.` at start)     | Enter                | ACTION                             |
| TRANSITION (ALL CAPS ending with `TO:` etc.) | Enter                | ACTION                             |
| ACTION (no indent)                           | Enter                | ACTION (standard behavior)         |
| Empty DIALOGUE line                          | Enter                | ACTION (same as dialogue → action) |

Detection is purely indent-based, matching the Tab cycling logic already in `fountain-keybindings.ts`.

### Implementation

File: `apps/web/app/features/screenplay-editor/lib/fountain-keybindings.ts`

Add `editor.addCommand(monaco.KeyCode.Enter, ...)` after the existing Tab command:

```typescript
editor.addCommand(monaco.KeyCode.Enter, () => {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return;

  const lineContent = model.getLineContent(position.lineNumber);
  const isCharacter =
    lineContent.startsWith(CHARACTER_INDENT) &&
    !lineContent.startsWith(DIALOGUE_INDENT);
  const isParenthetical =
    lineContent.trimStart().startsWith("(") &&
    lineContent.trimStart().endsWith(")");

  // CHARACTER and parenthetical → next line is DIALOGUE; everything else → ACTION
  const prefix = isCharacter || isParenthetical ? DIALOGUE_INDENT : "";

  const col = position.column;
  const lineLen = model.getLineLength(position.lineNumber);

  editor.executeEdits("fountain-enter", [
    {
      range: new monaco.Range(
        position.lineNumber,
        col,
        position.lineNumber,
        lineLen + 1,
      ),
      text: "\n" + prefix,
    },
  ]);
  editor.setPosition({
    lineNumber: position.lineNumber + 1,
    column: prefix.length + 1,
  });
});
```

---

## Feature 2 — Character & Location Autocomplete

### Behavior

**On a CHARACTER line** (6-space indent, not 10-space), Monaco suggests all character names that appear at least once in the current screenplay. Suggestions appear automatically on every keystroke; no special trigger character is needed.

**On a SCENE HEADING line** (starts with `INT.`, `EXT.`, `INT./EXT.`, etc.), Monaco suggests all locations already used in the screenplay. A location is extracted as the part between the `INT./EXT.` prefix and the `-` separator: `INT. COFFEE SHOP - DAY` → `COFFEE SHOP`.

Both suggestion lists are derived client-side from the current editor content — no server call. The lists update as the writer adds new characters or locations.

### Implementation

**New file:** `apps/web/app/features/screenplay-editor/lib/fountain-autocomplete.ts`

Exports three pure functions + one Monaco registration function:

- `extractCharacterNames(content: string): string[]` — returns sorted, deduplicated character names
- `extractLocations(content: string): string[]` — returns sorted, deduplicated locations
- `registerFountainAutocomplete(monaco, getContent): IDisposable` — registers a `CompletionItemProvider` for `fountain-screenplay`

The provider delegates to the extraction functions only when the cursor is on a matching line type. The `getContent` callback is a ref-based accessor so the provider always reads the latest editor state without re-registration.

**Modify:** `apps/web/app/features/screenplay-editor/components/MonacoWrapper.tsx`

- Add `contentRef = useRef(value)` synced in `useEffect`
- Call `registerFountainAutocomplete(monaco, () => contentRef.current)` inside `handleMount`

---

## Feature 3 — Live Page Position

### Behavior

The toolbar center section replaces the static page count with a live indicator:

```
Page 5 of 12 (~12 min)
```

- **Current page**: `Math.ceil(cursorLineNumber / 55)` — updates on every cursor move
- **Total pages**: `estimatePageCount(content)` — already computed, updates on content change
- **Duration**: total pages (1 page ≈ 1 min — same assumption already in spec 05)

### Implementation

**Modify:** `apps/web/app/features/screenplay-editor/lib/page-counter.ts`

Add: `export const currentPageFromLine = (lineNumber: number): number => Math.max(1, Math.ceil(lineNumber / 55))`

**Modify:** `apps/web/app/features/screenplay-editor/components/MonacoWrapper.tsx`

Add optional `onCursorChange?: (lineNumber: number) => void` prop. In `handleMount`:

```typescript
editor.onDidChangeCursorPosition((e) =>
  onCursorChange?.(e.position.lineNumber),
);
```

**Modify:** `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`

Add `const [cursorLine, setCursorLine] = useState(1)` and pass `currentPageFromLine(cursorLine)` + `pageCount` to `ScreenplayToolbar`.

**Modify:** `apps/web/app/features/screenplay-editor/components/ScreenplayToolbar.tsx`

Replace the current `pageCount` prop with `currentPage` + `totalPages`:

```tsx
<span className={styles.pageCount}>
  Page {currentPage} of {totalPages} (~{totalPages} min)
</span>
```

---

## Files

### Create

| File                                                                   | Purpose                                    |
| ---------------------------------------------------------------------- | ------------------------------------------ |
| `apps/web/app/features/screenplay-editor/lib/fountain-autocomplete.ts` | Autocomplete provider + extraction helpers |

### Modify

| File                                  | Change                                        |
| ------------------------------------- | --------------------------------------------- |
| `lib/fountain-keybindings.ts`         | Add smart Enter command                       |
| `lib/page-counter.ts`                 | Add `currentPageFromLine`                     |
| `components/MonacoWrapper.tsx`        | Wire autocomplete + `onCursorChange` callback |
| `components/ScreenplayEditor.tsx`     | Track cursor line, compute current page       |
| `components/ScreenplayToolbar.tsx`    | Display `Page X of Y (~Y min)`                |
| `features/screenplay-editor/index.ts` | Export new helpers                            |

---

## Tests

File: `tests/screenplay-editor/writing-features.spec.ts`

| Tag     | Description                                                        |
| ------- | ------------------------------------------------------------------ |
| OHW-051 | Tab from action → CHARACTER-indented, UPPERCASE                    |
| OHW-052 | Tab from character → DIALOGUE-indented                             |
| OHW-053 | Tab from dialogue → action (no indent)                             |
| OHW-054 | Enter after CHARACTER → new line is DIALOGUE-indented              |
| OHW-055 | Enter after DIALOGUE → new line is unindented (action)             |
| OHW-056 | Character autocomplete: existing name suggested on CHARACTER line  |
| OHW-057 | Scene heading autocomplete: existing location suggested after INT. |
| OHW-058 | Page indicator shows current page and updates on cursor move       |
