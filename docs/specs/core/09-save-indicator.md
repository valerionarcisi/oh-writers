# Spec 09 — Save Indicator + Manual Save

## Context

The editor today persists the ProseMirror doc (`pm_doc`) and the Yjs state on a debounce timer. The save is invisible — writers have no feedback that their work is safe. Yjs + debounce is correct behaviour but needs a UI affordance.

This spec adds a single control in the screenplay toolbar (left of the Spec 06 popover) that:

- shows the current save state via colour (green = saved, amber = pending, red = error)
- is clickable to force an immediate save
- coexists with the existing autosave — does not replace it

---

## User Story

As a writer, I want a visible save indicator that reassures me my work is stored, and a button I can click to flush pending changes before closing the tab or walking away.

---

## Behaviour

### States

The indicator is a state machine driven by the editor's dirty flag + the in-flight save promise:

| State     | Colour          | Label (tooltip)                              | Trigger                                                 |
| --------- | --------------- | -------------------------------------------- | ------------------------------------------------------- |
| `saved`   | green           | "Salvato · {relative time}"                  | No pending changes, last save succeeded                 |
| `dirty`   | amber           | "Modifiche non salvate"                      | Doc changed since last successful save, not yet flushed |
| `saving`  | amber (pulsing) | "Salvataggio in corso…"                      | Save request in flight                                  |
| `error`   | red             | "Salvataggio fallito — clicca per riprovare" | Last save returned an error                             |
| `offline` | grey            | "Offline — le modifiche sono in coda"        | `navigator.onLine === false`                            |

Relative time ("2 minuti fa") refreshes every 30s while idle.

### Autosave (existing, documented here)

Debounced save of `pm_doc` fires 1.5s after the last keystroke. On success → `saved`. On failure → `error` (without losing the dirty flag; autosave retries on the next change).

### Manual save

Clicking the indicator:

- in `dirty` → forces an immediate save (cancels the debounce, fires now)
- in `error` → retries the failed save
- in `saved` / `saving` → no-op (button disabled cursor, click is swallowed)
- in `offline` → no-op with tooltip explanation

Keyboard shortcut: `Cmd+S` / `Ctrl+S` triggers the same action and prevents the browser's default save dialog.

### Before-unload guard

When state is `dirty` or `error`, attach a `beforeunload` listener that shows the browser's native confirmation. Detached on unmount and whenever state returns to `saved`.

---

## UI

Small pill-shaped button in the toolbar, fixed width (prevents layout shift when the label changes). Contents: a status dot (coloured) + the current label, truncated if the toolbar is narrow (container query).

CSS Module following the existing brutalist tokens — no new colours. Add three new semantic tokens:

- `--color-status-saved` → maps to existing green accent
- `--color-status-dirty` → maps to existing amber/warning
- `--color-status-error` → maps to existing red/danger

Pulse animation for `saving` uses `@keyframes` + `prefers-reduced-motion: reduce` fallback.

---

## State source

The indicator reads from a single `useSaveStatus()` hook that subscribes to:

- the Yjs doc's `update` event → marks `dirty`
- the debounced save promise lifecycle → marks `saving` / `saved` / `error`
- `window.online` / `offline` events → marks `offline`

Hook returns `{ status, lastSavedAt, flush(): void }`. The toolbar button calls `flush()` on click.

No new server function — reuses the existing screenplay-save endpoint that autosave already hits.

---

## Error handling

| Situation                     | Outcome                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Save returns `DbError`        | State → `error`; indicator red; click retries                                                    |
| Save returns `ForbiddenError` | State → `error` with tooltip "Non hai i permessi per salvare"; click does NOT retry (would loop) |
| Network offline               | State → `offline`; Yjs buffers updates locally; on reconnect auto-flushes                        |
| Save times out (> 10s)        | State → `error`; abort controller cancels the request                                            |

No new error class — reuses existing screenplay save errors.

---

## Files

### Create

| File                                                                      | Purpose                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `features/screenplay-editor/hooks/useSaveStatus.ts`                       | State machine hook (dirty / saving / saved / error / offline) |
| `features/screenplay-editor/components/SaveIndicator.tsx` + `.module.css` | Pill button UI                                                |
| `features/screenplay-editor/lib/save-status.ts`                           | Pure state-machine reducer (testable in isolation)            |
| `features/screenplay-editor/lib/save-status.test.ts`                      | Vitest for the reducer                                        |

### Modify

| File                                                          | Change                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| `features/screenplay-editor/components/ScreenplayToolbar.tsx` | Insert `<SaveIndicator>` left of the toolbar popover   |
| `features/screenplay-editor/components/ScreenplayEditor.tsx`  | Expose the Yjs doc + save lifecycle to `useSaveStatus` |
| `apps/web/app/styles/tokens.css` (or equivalent)              | Add `--color-status-saved/dirty/error` tokens          |
| `features/screenplay-editor/index.ts`                         | Export the indicator                                   |

---

## Tests

### Vitest — `save-status.test.ts`

Drives the pure reducer through every transition. Assert:

- initial state is `saved`
- `docChanged` → `dirty`
- `saveStarted` → `saving`
- `saveSucceeded` → `saved` with fresh `lastSavedAt`
- `saveFailed(ForbiddenError)` → `error`, `retryable: false`
- `saveFailed(DbError)` → `error`, `retryable: true`
- `wentOffline` → `offline` preserves previous `dirty` flag so reconnect triggers a save

### Playwright — `tests/editor/save-indicator.spec.ts`

| Tag     | Description                                                                          |
| ------- | ------------------------------------------------------------------------------------ |
| OHW-140 | Fresh editor shows indicator in green `saved` state                                  |
| OHW-141 | Typing turns indicator amber `dirty`                                                 |
| OHW-142 | After 1.5s debounce indicator goes saving → green                                    |
| OHW-143 | Cmd+S while dirty forces immediate save and updates tooltip with new timestamp       |
| OHW-144 | Click on dirty indicator triggers immediate save                                     |
| OHW-145 | Simulated save failure (mocked) turns indicator red; click retries                   |
| OHW-146 | Going offline sets indicator to grey; going online auto-flushes and returns to green |
| OHW-147 | beforeunload confirmation fires when leaving with dirty state                        |
| OHW-148 | beforeunload confirmation does NOT fire after successful save                        |

---

## Scope — not in this spec

- Conflict resolution UI when two tabs save simultaneously → future
- Per-section save status (title page vs body) → future; Spec 07 title page uses its own explicit save
- Version snapshots on save → existing Versions feature, unchanged
- Showing other collaborators' save states → future
