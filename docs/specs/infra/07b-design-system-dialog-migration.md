# Spec infra/07b — Design-system Dialog migration

> **Status:** done (2026-04-22). 15 file, +407/-721. 102/102 Playwright verdi su `tests/editor` + `tests/documents`. Typecheck OK su tutto il monorepo.
>
> **Depends on:** infra/07b — Design system.
> **Trigger:** Spec 07c modal review showed 7 bespoke modals duplicating `<Dialog>` markup.
>
> **Implementation notes**
>
> - `Dialog` esteso con `size?: "sm"|"md"|"lg"|"xl"` (default `md`) e `showCloseButton?: boolean` (default `false`), backward compatible.
> - Tutte e 7 le modali migrate (vedi Inventory): SceneNumberConflictModal, ExportPdfModal, ExportScreenplayPdfModal, VersionCompareModal (size `xl`), ToolbarMenu PDF replace confirm, ScreenplayToolbar Resequence confirm, VersionsList color + delete confirms (delete in variant `danger`).
> - CSS module bespoke ripuliti — rimangono solo stili content-specific (choice cards, checkbox row, diff table, swatches). Cancellato `ImportedTitlePageConfirm.module.css`.
> - Tutti i `data-testid` preservati 1-a-1 per non rompere gli E2E esistenti.
> - Commit: `5e14214 [OHW] refactor(ui): migrate all bespoke modals to DS Dialog`.

## Goal

Migrare tutti i modali bespoke del codebase sopra il componente DS `<Dialog>`, eliminando markup duplicato (overlay, focus trap manuale, ESC handler, close button) e CSS module dedicati che non aggiungono valore.

## Inventory

| Componente                                                            | Tipo                | Note                                               |
| --------------------------------------------------------------------- | ------------------- | -------------------------------------------------- |
| `screenplay-editor/components/SceneNumberConflictModal.tsx`           | confirm + 2 choices | Body custom (choice cards), no close button        |
| `documents/components/ExportPdfModal.tsx`                             | options + footer    | × close, checkbox body, footer Annulla/Genera      |
| `screenplay-editor/components/ExportScreenplayPdfModal.tsx`           | options + footer    | × close, checkbox body, footer Annulla/Genera      |
| `documents/components/VersionCompareModal.tsx`                        | wide diff viewer    | size XL, × close, body con `<select>` + diff table |
| `screenplay-editor/components/ToolbarMenu.tsx` (inline confirm)       | confirm: replace    | 2-3 button variants (overwrite vs save-as-version) |
| `screenplay-editor/components/ScreenplayToolbar.tsx` (inline confirm) | confirm: resequence | 2 buttons                                          |
| `versions/components/VersionsList.tsx` (2 inline confirms)            | color change/delete | 2 buttons each, danger variant per delete          |

## DS Dialog extensions

Per coprire tutti i casi senza scrittura di markup custom:

1. **`size?: "sm" | "md" | "lg" | "xl"`** — controlla `max-inline-size`. Default `md` (corrisponde all'attuale `min(480px, 90vw)`). XL serve a `VersionCompareModal`.
2. **`showCloseButton?: boolean`** — quando `true`, renderizza una × accessibile nell'header. Default `false`.

## Out of scope

- Animazioni custom per-modal (`Dialog` ha già `slideUp` + `fadeIn`).
- Refactor della logica interna dei modali (confirm choices, diff renderer, picker color logic) — solo lo shell.
- Sostituire `<Dialog>` con altri pattern (popover, drawer).

## Migration order

1. Estendi `packages/ui/src/components/Dialog.tsx` con `size` + `showCloseButton`.
2. `SceneNumberConflictModal` — primo perché nessun close button, body custom.
3. `ExportPdfModal` + `ExportScreenplayPdfModal` — pattern identico.
4. `VersionCompareModal` — testa size XL.
5. Inline confirm in `ToolbarMenu` + `ScreenplayToolbar` — estraili in piccoli componenti separati.
6. Confirm in `VersionsList` — color + delete.
7. Drop dei CSS Module bespoke per ciò che resta vuoto.
8. Smoke test Playwright sui flow toccati (export, conflict, compare, resequence, replace).

## Tests

- Typecheck `pnpm typecheck` deve restare verde dopo ogni step.
- E2E Playwright: rieseguire suite editor + documents + versions a fine refactor, no nuovi test (i `data-testid` sono mantenuti 1-a-1 sui pulsanti per non rompere i test esistenti).
