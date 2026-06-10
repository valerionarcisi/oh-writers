# Spec 61 — Narrative autosave: canonical dirty-check (fix Cesare flash-then-revert)

## Problem

When Cesare applies an agentic edit to a narrative document (Soggetto, Sinossi,
Trattamento) the new version flashes into the editor and then **reverts to the
previous text**. The applied draft never becomes the stable current version.

### Root cause

The narrative editor (`FreeNarrativeEditor` → `NarrativeProseMirrorView`)
serialises its document to **HTML** (`docToHtml`, e.g. `<p>Filippo…</p>`). Cesare's
document-generation tools (`cesare-document-tools.ts`) write **plain text** to the
DB (the model is prompted to output prose, no markup).

`useAutoSave` decides "dirty" with a **raw string compare**:

```
isDirty = content !== savedContent
```

After a Cesare apply:

1. Cesare writes plain text → `documents.content` = `"Filippo…"`, new
   `currentVersionId`.
2. The route query refetches; `soggettoDoc.content` (the autosave `savedContent`)
   is now the plain text, and the resync effect pushes it into the editor as the
   `value` prop.
3. `NarrativeProseMirrorView` replaces the doc and immediately emits
   `onChange(docToHtml(...))` = `"<p>Filippo…</p>"` (HTML).
4. Now `content` (HTML, from the editor) `!==` `savedContent` (plain, from the DB)
   → **isDirty is permanently true** → autosave fires and writes the editor's
   serialisation back, creating a fresh version that supersedes Cesare's draft.

Because the plain↔HTML mismatch is purely a _serialisation_ difference (same
text), the document is "dirty" forever after any external apply, and the autosave
clobber wins — the user sees the new text disappear.

Confirmed in the dev DB: the current soggetto version is HTML-wrapped (`<p>…`)
while Cesare's earlier drafts are stored as plain text — the autosave round-trip
overwrote them.

## Fix

Make the autosave **dirty-check semantic, not textual**. Two contents that
serialise to the same ProseMirror document are NOT dirty.

- Add `canonicalNarrativeHtml(content, enableHeadings)` to
  `features/documents/lib/narrative-html.ts`: `docToHtml(htmlToDoc(content))`.
  Plain text and its `<p>`-wrapped HTML canonicalise to the same string.
- `useAutoSave` gains an optional `normalize?: (s: string) => string` parameter.
  The dirty-check becomes `normalize(content) !== normalize(savedContent)`
  (identity when omitted, so the logline single-line autosave is unchanged).
- The narrative doc pages (Soggetto, Sinossi, Trattamento) pass the narrative
  canonicaliser; the **content actually saved** stays the editor's HTML (we only
  change how _dirty_ is computed, never what we persist).

This defines the bug out of existence (Ousterhout): the autosave can no longer
consider a pure re-serialisation "dirty", so it never clobbers an external apply,
on **every** narrative document — not just Soggetto.

## Out of scope (tracked separately)

- Versions panel in Soggetto via SplitDrawer + VS Code-style diff — Spec 55 /
  BACKLOG Topic 1.
- "Mostra modifiche" / "Vedi modifica" opening the Versions SplitDrawer with the
  diff — Spec 55 / BACKLOG Topic 1.
- End-of-elaboration notifications regression — BACKLOG (new bug N-33).
- Per-feature export/import popover on the TopBar account line — Spec 55 / BACKLOG
  Topic 1.

## Tests

- **Unit** (`narrative-html.test.ts`): `canonicalNarrativeHtml("Filippo")` ===
  `canonicalNarrativeHtml("<p>Filippo</p>")`; distinct text canonicalises
  distinctly.
- **Unit** (`useDocument` / autosave): with a `normalize` that collapses
  plain↔HTML, a content that differs only by `<p>` wrapping is **not** dirty and
  schedules **no** save.
- **E2E** (`tests/cesare-agentic-soggetto-persist.spec.ts`, tag `OHW-061`): on the
  Soggetto page, apply a `propose_soggetto_v2` edit (mock AI); assert the new text
  is present in the editor and **still present after the autosave window**
  (override `__ohWritersAutoSaveDelayMs` low) — it does not revert.
