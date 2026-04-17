# Spec 20 — Shooting-script import: preserve original scene numbers

## Problem

When a writer imports a shooting-script PDF (e.g. _The Wolf of Wall Street_), the
PDF contains hand-assigned scene numbers that carry meaning beyond
"1, 2, 3, …" — they encode insertion history and production order:

```
1F     WE SEE a shot of the black glass Stratton Building, and:     1F
2      INT. STRATTON OAKMONT III – BULLPEN – DAY    (FEB `95)       2
3-3B   A SERIES OF POLAROIDS -- (1969)                           3-3B
```

Today `fountain-from-pdf.ts` strips these numbers as noise, and
`fountain-to-doc.ts` then renumbers every heading sequentially from 1.
Result: `1F`, `3-3B`, and every other production-significant suffix is lost
on import.

Since the schema already has `heading.attrs.scene_number` (string) and
`heading.attrs.scene_number_locked` (boolean) for exactly this use case,
the fix is a round-trip through the existing slots — no schema change.

## Goals

1. Preserve the original scene number (`1F`, `3-3B`, `42`, …) from a PDF
   import all the way into the PM doc's `heading.scene_number` attr.
2. Lock imported numbers so "Ricalcola numerazione scene" does not
   silently wipe them.
3. Give the writer a visible signal that a lock exists on a heading
   (UI lock icon) and a one-shot banner after import.

## Non-goals

- **Shot slugs** (lines like `1F   WE SEE...` without `INT.`/`EXT.`) stay
  classified as `action`. They lose their number. A future spec can
  introduce a `shot` node type if users ask for it.
- **Range-aware insert-between** (inserting a new scene between `3-3B`
  and `4` to produce `3C`). Out of scope — opens
  `21-scene-number-ranges.md`. Today the insert helper treats "3-3B" as
  an opaque string when computing the next letter; insert-between may
  collide. Documented, not fixed here.
- **Distinguishing imported-lock from manual-lock.** Both read as
  "locked" in the UI. No `scene_number_source` attr. Revisit if users
  request per-source bulk unlock.

## Design

### 1. Capture the number in `fountain-from-pdf.ts`

Two current helpers discard the number:

- `stripLeadingSceneNumber` — consumes `^\s*\d+[A-Z]?(?:-\d+[A-Z]?)?\s{2,}`
- `stripTrailingNoise` — consumes the mirror on the trailing side

Replace both with a single `extractSceneNumber` helper that returns
`{ line: string; number: string | null }`. Call it for every line; when
the line also matches `SCENE_HEADING_RE`, emit the heading in Fountain
forced-scene-number form:

```
INT. STRATTON OAKMONT III – BULLPEN – DAY #2#
```

Fountain's standard `#...#` trailing marker is the round-trip slot for
a forced scene number. The writer sees it in the raw text view; the
ProseMirror view reads it via the attr.

Numbers on non-heading lines (e.g. `1F   WE SEE ...`) are dropped —
see Non-goals.

### 2. Parse `#...#` in `fountain-to-doc.ts`

`buildHeadingNode` currently accepts a `scene_number` computed by the
caller (always sequential). Change the caller:

- Detect a trailing `#(.+?)#` on the heading line.
- If present → pass that string through as `scene_number` and pass
  `scene_number_locked: true`.
- Absent → fall back to sequential `String(scenes.length + 1)` with
  `scene_number_locked: false`.

`splitLegacyHeading` in `@oh-writers/domain` already strips the `#...#`
from the visible prefix/title split — verify with a unit test; patch
there if not.

### 3. Round-trip back out via `docToFountain`

Emit `#<scene_number>#` at the end of the heading line **only when**
`scene_number_locked === true`. Unlocked sequential numbers stay
implicit (no `#...#` written) — keeps Fountain files human-readable for
the 90% case.

### 4. UI — lock indicator on heading

`heading-nodeview.ts` renders the scene number in the left gutter.
Add a small 🔒 glyph (or a `::after` with a lock SVG mask) next to the
number when `scene_number_locked` is true. CSS-only, no JS.

### 5. UI — post-import banner

When `importPdf` returns and the imported Fountain contains any
`#...#` markers, `useImportPdf` surfaces a one-shot toast:

> "Importate N scene con numerazione originale. I numeri sono bloccati
> — sblocca dal popover della scena per rinumerare."

Auto-dismiss after 6s. Dispatched through the existing
`SCENE_NUMBER_TOAST_EVENT` bus — no new plumbing.

## Test plan

### Unit (Vitest)

- `fountain-from-pdf.test.ts` — new case feeding `06-wolf-page-1.txt`:
  - Exactly one heading detected (`INT. STRATTON ...`).
  - Its line ends with `#2#`.
  - The `A SERIES OF POLAROIDS` line is classified as `action`
    (non-goal shot slug) and the number `3-3B` is absent from the output.
- `fountain-to-doc.test.ts`:
  - `INT. FOO #1A#` → heading node with `scene_number = "1A"`,
    `scene_number_locked = true`.
  - `INT. FOO` → `scene_number = "1"`, `locked = false`.
- `doc-to-fountain.test.ts`:
  - Locked heading round-trips with `#...#`.
  - Unlocked heading round-trips without `#...#`.
- Domain: `sceneNumberForInsertion` with a range predecessor (`"3-3B"`)
  — document current behaviour (known limitation), assert with a
  `TODO(spec-21)` note in the test body.

### E2E (Playwright)

- `screenplay-import-wolf.spec.ts` — `[OHW-shooting-script-import]`:
  1. Sign in as Valerio, open a blank screenplay.
  2. Upload `tests/fixtures/the-wolf-of-wall-street.pdf` via the menu.
  3. Wait for import to complete.
  4. Assert at least one heading with data-number attr containing a
     letter (e.g. regex `/\d+[A-Z]/`).
  5. Assert the post-import toast appears.
  6. Click "Ricalcola numerazione scene" → confirm → assert the lettered
     scene's number is unchanged after resequence.

## Files touched

- `apps/web/app/features/screenplay-editor/lib/fountain-from-pdf.ts`
- `apps/web/app/features/screenplay-editor/lib/fountain-from-pdf.test.ts`
- `apps/web/app/features/screenplay-editor/lib/fountain-to-doc.ts`
- `apps/web/app/features/screenplay-editor/lib/fountain-to-doc.test.ts`
- `apps/web/app/features/screenplay-editor/lib/doc-to-fountain.ts`
- `apps/web/app/features/screenplay-editor/lib/doc-to-fountain.test.ts`
- `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts`
  (+ associated CSS)
- `apps/web/app/features/screenplay-editor/hooks/useImportPdf.ts`
- `tests/e2e/screenplay-import-wolf.spec.ts` (new)

No schema migration. No DB change.

## Rollout

Single PR. Feature-flag not required — old docs without `#...#` keep
the sequential fallback, and unlocked headings serialize identically to
today.
