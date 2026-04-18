# Known bugs — narrative editor

## Archived

### BUG-001 — Enter doesn't insert a new paragraph — **Fixed in spec 04e (2026-04-18)**

### BUG-002 — Char / page counters not visible — **Fixed in spec 04e (2026-04-18)**

### BUG-003 — `• List` toolbar button does nothing — **Fixed in spec 04e (2026-04-18)**

All three were caused by the Tiptap ↔ React 19 re-render coupling. Replaced Tiptap with a vanilla ProseMirror editor mounted imperatively (same pattern as the screenplay editor). See `docs/specs/core/04e-narrative-editor-prosemirror.md`.

Root cause that surfaced during implementation: the placeholder was rendered as a `Decoration.widget` editable span — typing landed inside the widget and PM discarded the DOM mutations. Fix: switch to `Decoration.node` + CSS `::before` (canonical PM placeholder pattern).

E2E coverage: `tests/documents/narrative-editor-regressions.spec.ts` (OHW-EDR-01..03), all green.
