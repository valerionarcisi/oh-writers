# Spec 63 — Narrative save: clobber fix beyond Soggetto + clickable 4-state pill

## Context

A deep audit of the narrative save path (Soggetto, Sinossi, Trattamento, Scaletta)
surfaced three defects. The user's report — "the save systems are always on, they
duplicate content, sometimes they delete documents" and "I want the top pill to be
clickable, green (saved) / orange (unsaved) / red (saving)" — maps onto them.

This spec fixes all three and reshapes the TopBar save pill into a clickable
4-state control.

## Problems

### P1 — Spec 61 clobber fix was applied to Soggetto only (CRITICAL)

Spec 61 made the autosave dirty-check **semantic** by passing a `normalize`
canonicaliser to `useAutoSave`, so a pure plain↔HTML re-serialisation is not
treated as a local edit and the autosave never clobbers an applied draft.

That fix lives **only** in the Soggetto route
(`_app.projects.$id_.soggetto.tsx`, via `FreeNarrativeEditor`). The other three
narrative documents render through `NarrativeEditor` → `DocumentRoutePage`:

| Document    | Editor                                 | `normalize` passed?            |
| ----------- | -------------------------------------- | ------------------------------ |
| Soggetto    | `FreeNarrativeEditor`                  | yes (`canonicalNarrativeHtml`) |
| Sinossi     | `NarrativeEditor`                      | **no**                         |
| Trattamento | `NarrativeEditor`                      | **no**                         |
| Scaletta    | `NarrativeEditor` (OutlineEditor body) | **no**                         |

`NarrativeEditor.tsx` calls `useAutoSave(save, document.id, content, document.content)`
with no 5th argument → identity normalise → the plain↔HTML mismatch makes the doc
**dirty forever** after any Cesare apply (or HTML re-serialisation) → the autosave
writes the editor's serialisation back over the applied text. The user sees the new
text flash in and then disappear ("sometimes they delete documents"), and each
clobber + the Cesare `auto-version.effect.ts` snapshot grows the version list
("duplicate content"). **The Spec 61 bug is still live on Sinossi / Trattamento /
Scaletta.**

### P2 — Triple save-state publisher races (CRITICAL for "always on")

The TopBar pill (`SaveStatusIndicator`) reads a single `SaveStateProvider` context.
But `NarrativeEditor` writes that context from **three** `useSaveStatePublisher`
calls that fight last-writer-wins:

1. main-doc `useAutoSave` → publishes inside `useDocument.ts` (`useSaveStatePublisher`).
2. logline `useAutoSave` (line ~242) → **also** publishes from the same hook body.
3. `NarrativeEditor` itself (line ~176) → publishes `publishedSaveState`.

Result: the pill flickers / stays lit, and the logline autosave runs with
`loglineDoc?.id ?? ""` — an **empty document id** when the logline doc hasn't
loaded — which can schedule a phantom save.

### P3 — Pill is a non-clickable span with only 3 collapsed states

`SaveState = "saved" | "saving" | "offline"`. The state machine collapses dirty and
in-flight into one:

```
save.isPending || isDirty  → "saving"   // dirty AND saving are the same state
lastSavedAt                → "saved"
```

There is no `dirty` (porcelain / unsaved) state and no `error` state, and
`SaveStatusIndicator` renders a `<span>` — not clickable.

## Fix

### F1 — Thread `normalize` through `NarrativeEditor` (closes P1)

Pass the narrative canonicaliser to the main-doc `useAutoSave` in `NarrativeEditor`,
mirroring Soggetto:

- Sinossi / Trattamento: `canonicalNarrativeHtml(s, enableHeadings)` where
  `enableHeadings = isTreatment` (matches the schema the editor uses).
- Scaletta (Outline): the body is JSON-serialised outline, not HTML. Use a
  parse→reserialise canonicaliser (`serializeOutline(parseOutline(s))`) so a stable
  reorder/no-op re-serialisation is not "dirty". If that is identity in practice,
  omitting `normalize` is acceptable — Outline does not go through the plain↔HTML
  Cesare path, so the clobber cannot occur there. Decision recorded during impl.
- Logline autosave keeps identity (single-line plain text), as today.

The content **persisted** stays the raw editor `content` — we only change how
_dirty_ is computed (same contract as Spec 61).

### F2 — Single source of truth for the pill (closes P2)

`useAutoSave` stops publishing the save-state itself. Publication becomes the
**caller's** responsibility, from exactly one place per page:

- Remove the `useSaveStatePublisher` call from `useAutoSave` (`useDocument.ts`).
  The hook still returns `{ isDirty, isSaving, isError, lastSavedAt, flush }`.
- `NarrativeEditor` keeps its single `useSaveStatePublisher`, now derived from the
  **main-doc** autosave result only (never the logline), and computes the full
  4-state value (F3). The logline autosave no longer publishes.
- The logline autosave is guarded: do not schedule when the document id is empty.
  Add a `useAutoSave` early-out `if (!documentId) return` around the scheduling
  effect and `flush`.
- Soggetto route: same single-publisher rule — publish from the page once, derived
  from the soggetto autosave (not the logline autosave).

### F3 — Clickable 4-state pill (closes P3)

Extend the save state to four values and make the pill a button:

- `SaveState = "saved" | "dirty" | "saving" | "error" | "offline"` in
  `@oh-writers/ui` (`SavePill.tsx`). `offline` retained for back-compat; existing
  consumers that only emit the old three keep working.
- State derivation (in the page, fed to `useSaveStatePublisher`):

  ```
  if (isError)        → "error"
  if (isSaving)       → "saving"
  if (isDirty)        → "dirty"
  if (lastSavedAt)    → "saved"
  else                → undefined   // hidden until first edit (V7 rule kept)
  ```

  Note this **separates** `dirty` from `saving` — they are no longer collapsed.

- `SaveStateProvider` carries an optional `onFlush?: () => void` alongside
  `state`/`secondsAgo`. `useSaveStatePublisher(state, secondsAgo, onFlush)` passes
  the page's `flush`.
- `SaveStatusIndicator` renders a `<button>` driven by react-aria `useButton`
  (mandatory per CLAUDE.md), `onPress = onFlush`, disabled when `state` is
  `saving` or `saved` (nothing to flush). `aria-label` describes the action
  ("Salva ora" when dirty/error). Keep `data-state` + `data-testid`.
- Colours (CSS Modules, tokens only — confirmed mapping: **standard**, red = error):

  | State   | Token                     | Meaning                       |
  | ------- | ------------------------- | ----------------------------- |
  | saved   | `--ds-success`            | green — saved                 |
  | dirty   | `--ds-warning`            | orange — unsaved (clickable)  |
  | saving  | `--ds-saving` + pulse dot | orange, pulsing — in progress |
  | error   | `--ds-danger`             | red — save failed (clickable) |
  | offline | `--ds-warning`            | offline                       |

  Note: the design system is a clay/leaf bichromy with **no blue accent**, so
  "saving" is not blue. `dirty` and `saving` share the warning/clay hue and are
  distinguished by the **pulsing dot** on `saving` (the proven screenplay
  `SaveIndicator` convention) plus clickability (`dirty`/`error` are actionable,
  `saving`/`saved` are not). This keeps the user's intent — green = saved,
  orange = unsaved/working, red = problem — within the brand palette.

  Labels (IT, via i18n keys under `shell.save.*`): `saved` "Salvato" (+ "Ns fa"),
  `dirty` "Non salvato", `saving` "Salvataggio…", `error` "Errore salvataggio",
  retry hint in title.

### F4 — Unify the pill (one clickable control, app-wide)

The Screenplay editor already ships the correct control: `SaveIndicator`
(`features/screenplay-editor/components/`) is a `<button>` with a 5-state machine
(`computeSaveStatus` / `save-status.ts`), distinct dirty≠saving, green/orange/blue/
red, ⌘S-to-save and a `beforeunload` guard. The TopBar `SaveStatusIndicator`
(app-shell) is the divergent, inferior one.

Converge on one shared primitive instead of two:

- Promote the screenplay save-status logic to the shared layer. `computeSaveStatus`
  - `SaveStatusValue` move to `@oh-writers/ui` (alongside `SavePill`) as the single
    source of the 5-state machine; the editor and the app-shell both consume it.
- `SaveStatusIndicator` (the live TopBar pill) becomes a thin render of that shared
  state + the `onFlush` from the context (F3). The bespoke screenplay `SaveIndicator`
  is either retired in favour of the shared pill or reduced to the shared pill plus
  its editor-only concerns (⌘S handler, `beforeunload`) — decided during impl, but
  the **state machine and the visual are one**, not two.
- One pill, one set of states, one colour mapping for narrative AND screenplay.

### S — Screenplay save defects (same family)

`useScreenplay`'s autosave shares the narrative bugs:

- **S1 (divergent indicators).** On the screenplay page both `SaveIndicator`
  (correct, 4-state) and the TopBar pill (collapsed `dirty`+`saving`) render, telling
  the user two different things. Fixed by F4 (one pill) + the TopBar pill deriving the
  full state via `computeSaveStatus`.
- **S2 (clobber — CONFIRMED).** `useScreenplay.ts` computes `isDirty =
content !== savedContent` on raw strings. The editor emits `docToFountain(doc)`,
  but the stored fountain (PDF import, Cesare plain edit, older saves) is **not** the
  serializer's canonical form — `docToFountain(fountainToDoc(x)) !== x` for normal
  inputs (the serializer re-indents character/dialogue and normalises blank lines /
  trailing newline; measured: 3/4 sampled inputs differ on the first round-trip,
  reaching a fixed point on the second). So an externally-written screenplay is
  **dirty on first render with zero user edits** → a phantom autosave fires and
  rewrites the stored content to the serializer's form (and can spawn a version),
  matching the user's "always saving / duplicates" report. Fix: pass a `normalize`
  to the screenplay autosave dirty-check — `docToFountain(fountainToDoc(s))` (the
  canonical fountain), so a pure re-serialisation is not dirty. Same Spec 61
  contract, applied to the fountain round-trip. Persisted content stays raw.
- **S3 (swallowed save errors).** `flush()` in `useScreenplay.ts` resolves on both
  success and failure (`.then(ok, () => undefined)`), so a failed manual save shows
  no error to the user beyond the async `save.isError`. Fix: let `flush` surface the
  rejection (or set an explicit error state) so the pill can show `error` after a
  manual save that failed.

## Out of scope

- The `SavePill` primitive's own styling is updated only enough to accept the new
  states without breaking its 3 current consumers (title-page, tokens dev page,
  TopBar deprecated prop). The live pill is `SaveStatusIndicator`.
- Versions list de-duplication / pruning — separate concern; this spec stops the
  clobber that _creates_ the dupes, it does not retro-clean existing version rows.
- Realtime (Yjs) seeding — unrelated (BUG-N41 handled elsewhere).

## Tests

- **Unit** (`useDocument` autosave): with a `normalize` collapsing plain↔HTML, a
  content differing only by `<p>` wrapping is **not** dirty and schedules no save
  (extends Spec 61 unit beyond Soggetto). Logline autosave with empty `documentId`
  schedules no save and never calls `save.mutate`.
- **Unit** (state derivation helper): error→"error", pending→"saving",
  dirty→"dirty", saved→"saved", pristine→undefined; dirty and saving are distinct.
- **Unit** (`SaveStatusIndicator`): renders a `<button>`; `onFlush` fires on press
  when `dirty`/`error`; disabled (no press) when `saving`/`saved`; correct
  `data-state` per state.
- **E2E** (`tests/narrative-save-persist.spec.ts`, tag `OHW-063`): on **Sinossi**
  and **Trattamento**, apply a Cesare agentic edit (mock AI); assert the new text is
  present and **still present after the autosave window** (override
  `__ohWritersAutoSaveDelayMs`) — it does not revert. Parity with the Soggetto
  `OHW-061` test.
- **E2E** (`tests/narrative-save-pill.spec.ts`, tag `OHW-063`): type into the
  editor → pill shows `data-state="dirty"` (orange); click the pill → it flushes →
  `data-state="saving"` then `data-state="saved"` (green). Single pill, no flicker.
- **Unit** (fountain canonicaliser, `useScreenplay` / `save-status`): a stored
  fountain whose only difference from the editor's output is indentation / blank-line
  normalisation is **not** dirty under the `normalize` (S2 regression). A real text
  edit IS dirty.
- **Unit** (`computeSaveStatus` shared): unchanged behaviour after the move to
  `@oh-writers/ui` (offline > error > saving > dirty > saved).
- **E2E** (`tests/screenplay-save-persist.spec.ts`, tag `OHW-063`): open a screenplay
  imported from PDF (non-canonical indentation); assert it is **not** auto-saved on
  load (no phantom version, content unchanged after the autosave window) and the pill
  reads `saved`, not `saving`/`dirty`.
- **E2E** (existing `tests/editor/save-indicator.spec.ts`): keep green after F4 —
  the screenplay pill still flips dirty→saving→saved on edit and ⌘S still flushes.
