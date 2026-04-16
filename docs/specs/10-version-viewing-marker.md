# Spec 10 — Version viewing marker

When a writer opens a snapshot from the `VersionsPanel`, the editor must make
it unmistakable that the content on screen is **a frozen version**, not the
live draft. The writer can return to the live draft or restore the snapshot,
but cannot edit it in place.

## Context

Spec 06b gave us an inline `VersionsPanel` with Add / Rename / Duplicate /
Delete. It does not yet let the writer _look at_ an older version from inside
the editor. Today the only way to inspect a snapshot is the full-page
`/screenplay/versions` route, which loses editor context.

This spec adds an ephemeral "viewing mode" to the editor itself: a read-only
overlay rendered over the current editor surface, with a prominent banner
and two escape hatches.

## User Story

> As a writer, I write a scene, save it as **Draft 1**, keep writing, then
> save **Draft 2**. Later I open the versions panel and click **Visualizza**
> on Draft 1. The editor instantly shows Draft 1's content in a read-only
> view with a warm banner at the top: \_"Stai visualizzando 'Draft 1' · [Torna
>
> > alla bozza] [Ripristina questa versione]"\_. I cannot type. I click **Torna
> > alla bozza** and I'm back on my live draft, exactly where I left it.

## Behaviour

1. Each row in `VersionsPanel` gains a **Visualizza** action (primary on the
   row, next to Rinomina).
2. Clicking **Visualizza** fetches the version via `getVersion` and enters
   **view mode**:
   - Editor swaps its `content` + `pmDoc` for the snapshot's.
   - Editor is made read-only (`editable: false` on the ProseMirror view).
   - Autosave is suspended — no save indicator activity, no write to DB.
   - A sticky banner renders above the toolbar.
3. Banner content: _"Stai visualizzando **\<label\>** · salvata il
   \<date\>"_ on the left, two buttons on the right:
   - **Torna alla bozza** — exits view mode, restores the live draft's
     `content`/`pmDoc` as they were before viewing, re-enables the editor
     and autosave.
   - **Ripristina questa versione** — calls the existing
     `restoreVersion` server fn, then exits view mode.
4. If the live draft is **dirty** (unsaved changes) when the writer clicks
   **Visualizza**, show a confirm dialog: _"Hai modifiche non salvate.
   Salvale prima di visualizzare un'altra versione?"_ with **Salva e
   visualizza** / **Scarta e visualizza** / **Annulla**. "Salva e visualizza"
   flushes the autosave, then proceeds.
5. View mode is **ephemeral**: it lives in component state only. A page
   reload always lands on the live draft.
6. During view mode the versions panel stays usable — clicking another row's
   **Visualizza** swaps the snapshot without exiting view mode.
7. Versions panel highlights the row currently being viewed
   (`data-viewing="true"`) so the writer knows which snapshot is on screen.

## UI

- New component `VersionViewingBanner.tsx` in
  `features/screenplay-editor/components/`. Renders only when view mode is
  active. Warm tone: `--color-warning` background, foreground text with
  enough contrast; uses `--radius-md`.
- `ScreenplayEditor.tsx` owns the viewing state:
  ```ts
  type ViewingState =
    | { kind: "live" }
    | {
        kind: "viewing";
        versionId: string;
        label: string;
        createdAt: string;
        savedContent: string;
        savedPmDoc: Record<string, unknown> | null;
      };
  ```
  `live` = normal, `viewing` = snapshot on screen, `savedContent`/`savedPmDoc`
  remember the live draft so we can put it back when the user clicks
  **Torna alla bozza**.
- `ProseMirrorView` gains an `isReadOnly?: boolean` prop that maps to the
  editor's `editable` config.
- Save indicator is hidden (not merely disabled) while viewing — the row is
  not the live draft, so save state is meaningless.

## Server

No new server functions. Existing `getVersion` and `restoreVersion` are
sufficient.

## State transitions

```
               ┌──────── click Visualizza (clean draft) ────────┐
               │                                                │
               ▼                                                │
  ┌────────┐                             ┌─────────────────┐    │
  │  live  │◀── Torna alla bozza ────────│     viewing     │────┘
  │ draft  │                             │ <versionId set> │
  └────────┘                             └─────────────────┘
     ▲                                           │
     │                                           │ click another
     │                                           │ Visualizza
     │                                           ▼
     │                                   ┌─────────────────┐
     │                                   │ viewing         │
     │                                   │ <new version>   │
     │                                   └─────────────────┘
     │                                           │
     └─── Ripristina questa versione ────────────┘
          (restoreVersion mutation, then back to live draft
           with the restored content)
```

## Tests

Playwright, tagged `[OHW-150..155]`, new file
`tests/editor/version-viewing.spec.ts`:

- **OHW-150** Fresh authoring: create project, type content, Add version
  "Draft 1", edit more, Add version "Draft 2". Both rows show in panel.
- **OHW-151** Click **Visualizza** on Draft 1 — banner is visible, contains
  "Draft 1", editor contains Draft 1 content, editor is read-only
  (attempting `page.keyboard.type(...)` does NOT change content).
- **OHW-152** Click **Torna alla bozza** — banner gone, editor contains
  Draft 2's content again, typing works.
- **OHW-153** Viewing Draft 1, click **Ripristina questa versione** — banner
  closes, editor now shows Draft 1 content AND is editable. Panel lists a
  new auto/manual row depending on restore semantics.
- **OHW-154** Confirm-on-dirty: type additional text (do not save), click
  **Visualizza** on Draft 1 → confirm dialog appears. **Annulla** keeps
  editor state untouched.
- **OHW-155** No autosave while viewing: open view mode on Draft 1, wait past
  the debounce window, network tab has zero `saveScreenplay` calls.

## Files

- `docs/specs/10-version-viewing-marker.md` (this file)
- `apps/web/app/features/screenplay-editor/components/VersionViewingBanner.tsx` (new)
- `apps/web/app/features/screenplay-editor/components/VersionViewingBanner.module.css` (new)
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`
  (own viewing state, suspend autosave, swap content, render banner)
- `apps/web/app/features/screenplay-editor/components/ProseMirrorView.tsx`
  (accept `isReadOnly` prop, bind to `editable`)
- `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx`
  (add **Visualizza** action, surface active row via `data-viewing`, accept
  `viewingVersionId` + `onView` props)
- `apps/web/app/features/screenplay-editor/components/VersionsPanel.module.css`
  (style active row)
- `apps/web/app/features/screenplay-editor/index.ts`
  (export `VersionViewingBanner`)
- `tests/editor/version-viewing.spec.ts` (OHW-150..155)

## Constraints

- View mode lives entirely client-side — no new DB columns, no server state.
- Autosave must not fire during view mode: the easiest way is to short-circuit
  inside `useAutoSave` based on a `disabled` flag passed from the editor.
- Reuse existing tokens only — `--color-warning`, `--color-warning-fg`
  (add to theme if missing), `--radius-md`, `--shadow-sm`, `--space-*`.
- Respect `prefers-reduced-motion` for the banner slide-in.
- No AI signatures in the commit — use `[OHW] feat: version viewing marker`.
