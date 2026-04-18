# Known bugs — narrative editor

## Open

### BUG-004 — Playwright suite: 32 failing tests across 5 specs (2026-04-18)

Marked as tech debt; not blocking the move to spec 10 (breakdown). Triaged but not fixed.

**Failing buckets** (32 total, suspected 2–3 root causes — not 32 distinct bugs):

- `tests/documents/narrative-editor.spec.ts` — 9 failures (auth + autosave)
- `tests/editor/scene-number-edit.spec.ts` — 12 failures
- `tests/editor/screenplay-authoring.spec.ts` — 3 failures (S04, S05, S06)
- `tests/editor/screenplay-versioning.spec.ts` — 1 failure (OHW-258)
- `tests/editor/version-viewing.spec.ts` — 1 failure (OHW-150)
- `tests/editor/toolbar-menu.spec.ts` — 1 failure (OHW-106)
- `tests/projects/title-page.spec.ts` — 5 failures (FP21..FP25)
- `tests/documents/narrative-export.spec.ts` — 1 failure (OHW-226)

**Triage findings:**

- Not caused by the 79fd145 fixes (verified by reverting the CSS scoping — same fail).
- DB seed is correct (screenplay row has 14k chars + pmDoc with 10 scenes).
- Symptoms point to:
  1. **Screenplay rendering**: pmDoc seeded but editor mounts with a single empty heading (`s.1/0` indicator). Suggests `getScreenplay` → `ProseMirrorView` doesn't wire the seeded pmDoc on first mount, or the schema migration strips it.
  2. **Title page autosave race**: typing a long string only registers the first character in the breadcrumb — every keystroke probably triggers a re-fetch that resets the field.
- Cluster fix likely 1–2 root causes, ~2–6h of work.

To pick this up: run the full suite once to group errors by stack trace, fix the screenplay pmDoc loading first (unblocks ~15 tests), then the title-page race (unblocks ~5).

## Archived

### BUG-001 — Enter doesn't insert a new paragraph — **Fixed in spec 04e (2026-04-18)**

### BUG-002 — Char / page counters not visible — **Fixed in spec 04e (2026-04-18)**

### BUG-003 — `• List` toolbar button does nothing — **Fixed in spec 04e (2026-04-18)**

All three were caused by the Tiptap ↔ React 19 re-render coupling. Replaced Tiptap with a vanilla ProseMirror editor mounted imperatively (same pattern as the screenplay editor). See `docs/specs/core/04e-narrative-editor-prosemirror.md`.

Root cause that surfaced during implementation: the placeholder was rendered as a `Decoration.widget` editable span — typing landed inside the widget and PM discarded the DOM mutations. Fix: switch to `Decoration.node` + CSS `::before` (canonical PM placeholder pattern).

E2E coverage: `tests/documents/narrative-editor-regressions.spec.ts` (OHW-EDR-01..03), all green.
