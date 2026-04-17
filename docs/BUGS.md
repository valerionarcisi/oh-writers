# Known bugs — Tiptap rich-text editor (synopsis / treatment)

Tracking open issues on the Tiptap-based editor introduced in Spec `core/04d-rich-text-editor.md`. Opened 2026-04-17 after repeated rounds of fixes failed to resolve them in Valerio's browser.

## BUG-001 — Enter doesn't insert a new paragraph at end of line/document

- **Where:** `/projects/:id/treatment`, `/projects/:id/synopsis`
- **Repro:** place the caret at the end of a word or at the end of the document, press Enter. Nothing happens visually. Pressing Enter in the middle of a word does split the word into two paragraphs.
- **Expected:** Enter splits the current block and moves the caret to a new empty paragraph.
- **Observed with E2E (Playwright, Test User with read-only disabled):** Enter actually does create `<p><br></p>` in the DOM. So the editor internally handles Enter, but in Valerio's browser the change is either not visible or immediately reverted.
- **Suspected cause:** not confirmed. Possibly related to how `onUpdate` → parent `setContent` → re-render → `useEditor` re-runs interacts with Tiptap v3's `setOptions`/`updateState` path. The `useMemo` stabilization landed in commit `e280f66` did not resolve it on the affected machine.
- **Files:**
  - `apps/web/app/features/documents/components/RichTextEditor.tsx`
  - `apps/web/app/features/documents/components/NarrativeEditor.tsx`

## BUG-002 — Char / page counters not visible

- **Where:** `/projects/:id/treatment`, `/projects/:id/synopsis`
- **Repro:** open either page. Counters "`N characters`" and "`~N page(s)`" are in the DOM but the user reports they're not rendered/visible.
- **Verified via Playwright:** the DOM contains the counters. In one session they appeared at the bottom-right inside the scroll area; user reports they do not show on their screen.
- **Suspected cause:** layout/overflow interaction between `editorArea` (grid) → `editorMain` (flex column, `overflow-y: auto`) → `RichTextEditor` wrapper (`flex: 1`) → footer. Tried `grid-template-rows: 1fr`, `flex-shrink: 0` on footer, `min-block-size: 0` cascade. Still not resolved on the affected machine.
- **Files:**
  - `apps/web/app/features/documents/components/NarrativeEditor.module.css`
  - `apps/web/app/features/documents/components/RichTextEditor.module.css`

## BUG-003 — `• List` toolbar button does nothing in Treatment

- **Where:** `/projects/:id/treatment` (Treatment is the only narrative doc with `enableHeadings=true` → list toolbar button shown).
- **Repro:** click the "• List" pill in the toolbar. Nothing happens. Also pressing `Cmd/Ctrl+Shift+8` (Tiptap default shortcut) does nothing visible.
- **Verified via Playwright:** could not verify button click path because Test User has no edit permission (toolbar hidden). Needs a repro as an editor-role user.
- **Suspected cause:** probably the same underlying re-render issue as BUG-001 — the command runs but the state is discarded. CSS for `ul/li` was added explicitly (`list-style-type: disc`, `display: list-item`) to rule out the global `* { padding: 0 }` reset hiding bullet markers.
- **Files:**
  - `apps/web/app/features/documents/components/RichTextEditor.tsx`
  - `apps/web/app/features/documents/components/RichTextEditor.module.css`

## Fixes attempted (all on `main`)

| commit    | change                                                             |
| --------- | ------------------------------------------------------------------ |
| `7b01271` | make Tiptap editor fill the writing area                           |
| `aaee5f5` | Tiptap CSS `:global(.tiptap)` scoping + synopsis page counter      |
| `289a81f` | caret-color, SSR `immediatelyRender: false`, counter footer layout |
| `4336483` | empty paragraphs `min-block-size: 1lh`, scroll on wrapper          |
| `2bf569b` | bullet list CSS + `shouldRerenderOnTransaction: true`              |
| `e280f66` | memoized extensions + frozen initial content + `ref`-stable on\*   |

## Next steps when we come back to this

1. Add a unit test that mounts `<RichTextEditor>` under React 19 strict-mode double-render and asserts Enter creates `<p>` + `<p><br></p>`.
2. Log each render of `RichTextEditor` with `console.count` to confirm whether HMR is really re-delivering the `useMemo` version in dev.
3. If the re-render theory turns out wrong, move the editor into a ref-stable wrapper (uncontrolled): only set initial content, read via `editor.getHTML()` in an `onBlur` or debounced `onUpdate` that does **not** round-trip through parent state.
4. Evaluate whether to drop the inline toolbar + rich blocks for these two documents and keep them as plain `<textarea>` (like Logline). The product value of bold/H2/lists on synopsis/treatment is debatable; plain text + markdown in a future pass may be a better fit.
