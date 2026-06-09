# Spec 69 — Screenplay editor keyboard shortcuts (discoverability + gaps)

Status: **Planned** (2026-06-09). Not built. Pulled from a real-use request:
"possiamo aggiungere short da tastiera per le action dell'editor della
sceneggiatura?"

## Key finding: the shortcuts already exist — they are just invisible

`apps/web/app/features/screenplay-editor/lib/plugins/keymap.ts` (Spec 05e) already
binds the element actions:

| Action                | Shortcut(s)                 |
| --------------------- | --------------------------- |
| Scena                 | `Mod-1` / `Alt-S`           |
| Azione                | `Mod-2` / `Alt-A`           |
| Personaggio           | `Mod-3` / `Alt-C`           |
| Dialogo               | `Mod-4` / `Alt-D`           |
| Parentetica           | `Mod-5` / `Alt-P`           |
| Transizione           | `Mod-6` / `Alt-T`           |
| Cycle element         | `Tab`                       |
| Next block            | `Enter` (element matrix)    |
| Focus mode            | `Mod-Shift-F`               |
| Bold/Italic/Underline | `Mod-B` / `Mod-I` / `Mod-U` |

So the work is **NOT** "add shortcuts" — it is **make them discoverable** and **close
any gaps**.

## Why

The element toolbar (SCENA · AZIONE · PERSONAGGIO · …) gives no hint that each has a
shortcut. A screenwriter coming from Final Draft / WriterDuet expects `Cmd+1..6`
and a visible cheatsheet. Today they have to read the source to find them.

## What (scope)

1. **Toolbar hints** — show the shortcut on each element pill (tooltip on hover, or a
   subtle inline hint), driven from a single shortcut map (DRY — the same map the
   keymap is built from, so hint and binding can never drift).
2. **Shortcuts cheatsheet** — a `?`-triggered overlay (or a `⋯` menu entry) listing
   all editor shortcuts. Use `react-aria` `useDialog`/`useOverlay` (CLAUDE.md rule).
3. **Gap audit** — confirm coverage and fill obvious holes:
   - `Mod-7` is unbound (only 1–6 exist) — decide if a 7th element is needed.
   - Undo/redo are realtime-mode dependent (`Mod-Z`/`Mod-Y` only wired off-realtime
     via prosemirror-history; in realtime the Yjs undo plugin owns it) — verify both
     paths actually undo and document it.
   - No shortcut for the page-level actions (import/export/versions) — out of scope
     here (those live in the `⋯` menu, Spec 67); the cheatsheet may still list them.

## Constraints

- **Single source of truth** for the shortcut map: derive both the keymap bindings
  and the UI hints from one table (currently the bindings are hand-written in
  `keymap.ts`). Refactor to a shared map so a new binding shows up in the cheatsheet
  automatically (DRY / orthogonality).
- **Platform**: show `⌘` on macOS, `Ctrl` elsewhere (the editor must read as native).
- **i18n**: shortcut labels/cheatsheet copy in IT (UI copy), identifiers/code in EN.
- **Mobile/touch** (iPad companion): the cheatsheet still renders; bindings are a
  no-op without a keyboard — don't hard-depend on key events for any action that has
  no toolbar equivalent.

## Tests (to define when built)

- Unit: the shared shortcut map → keymap binding parity (every map entry produces a
  binding; the cheatsheet renders every map entry).
- E2E (OHW-069): press each `Mod-1..6` in the editor → the active element pill
  updates; open the cheatsheet → all shortcuts listed; tooltip shows on a pill.

## Related

- Spec 05e (the existing element-switch bindings this spec surfaces).
- Spec 25 (`react-aria` for the cheatsheet overlay).
- Spec 67 (page-level `⋯` actions — not editor element shortcuts).
