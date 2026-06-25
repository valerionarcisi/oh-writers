# Spec 78 — Narrative shell UX fixes (6 bugs)

Shared contract for the agent fleet fixing 6 UI bugs found in real use on the
soggetto page (2026-06-25). Every agent + judge reads THIS as the source of truth.

Base: `main` @ `4c95dcc5`. Dev stack on :3000, `MOCK_AI=false`, seed project
`00000000-0000-4000-a000-000000000012`, login `valerio@ohwriters.dev` / `valerio123`.

Out of scope: the realtime CRDT propagation gap (#35) — it now works after a
reload; do NOT touch the ws-server / `notify-room-reseed` / `useYjsRoom`.

---

## A1 — TopBar header squish when Cesare is in split

**Bug:** with `?peek=cesare` open the main lane compresses and the TopBar's left
cluster (hamburger + "Soggetto" breadcrumb + VERSIONI + ⋯ + bell/avatar/gear)
squishes/collapses to the left instead of degrading gracefully.

**Where:** `packages/ui/src/shell/TopBar/TopBar.module.css` (grid ~38-41, container
query ~65-75); the `.left` cluster has `min-width:0` and no flex-shrink guard.

**Fix:** the TopBar must degrade cleanly at narrow widths (the Cesare-split main
lane can be ~450-650px). The left cluster items must not overlap or clip; drop the
center logline pill to its own row earlier if needed (the BUG-N38 container query
already does this at 1180px — verify the threshold fits the Cesare-split width).
No hardcoded px outside tokens; use `--ds-*`. Verify live at the Cesare-split width

- a Playwright viewport/hit-test regression.

## A2 — Kill the "Mostra cosa è cambiato" banner clutter

**Bug:** the entity-change banner stacks 2-3 cards ("✦ Cesare ha aggiornato il
soggetto · Mostra cosa è cambiato · ↩ Indietro · ×") above the editor. "Mostra
cosa è cambiato" only flashes an inline highlight (feels no-op); the owner wants it
GONE. The canonical agentic pattern: the edit applies LIVE, no floating
"mostra modifiche" clutter; true revert lives in the Versions drawer.

**Where:** `apps/web/app/features/documents/components/CesareUpdatedBanner.tsx` +
its store (`useLiveEditsFor`, stack-per-docType, no dedupe).

**Fix:** remove the banner's floating card clutter. Acceptable end-states (pick the
cleanest per CLAUDE.md "Agentic Edit Pattern" + Spec 47e):

- No banner at all (the edit is already live; the chat result card is the record), OR
- ONE discreet, auto-dismissing line max — never a stack, never a persistent pile.
  Remove "Mostra cosa è cambiato" (the inline-highlight affordance the owner finds
  confusing). Dedupe so multiple Cesare turns NEVER stack multiple cards. Keep revert
  in the Versions drawer only. Update/replace the related E2E (OHW-N38 / show-changes
  tests) to the new contract — do not leave red aspirational tests.

## A3 — Active version must be obvious in the Versions list

**Bug:** in the Versions master list you cannot tell which version is the active /
current one at a glance (only a small badge in the detail pane).

**Where:** `apps/web/app/features/versions/components/VersionsSplitDrawer.tsx`
(`renderVersionRow` ~221-286; `versions-split-current-${id}` badge ~269-279).

**Fix:** the active version's ROW is visually distinct in the list — a highlighted
row background (`--ds-agent-soft` or similar token) + a clear "● attuale" marker
(dot + label). Obvious at a glance without opening the detail. Tokens only, no rogue
hex. E2E: the active row carries a distinct marker/class.

## A4 — Activating a version gives clear feedback + updates the editor

**Bug:** clicking activate ("Attiva" / "Versione attuale") gives no visible feedback;
the user isn't sure it worked.

**Where:** `VersionsSplitDrawer.tsx` detail activate (~293-300) + the parent
`VersionsSplitLane.tsx` (`activate.mutate(id, { onSuccess })` ~132 narrative).

**Fix:** on activate, show visible confirmation (a success toast "Versione attivata"
via the shell toast + the current badge/row marker moves to the activated version).
Ensure the editor reflects the activated content (the DB + CRDT reseed already exist
from #35; this is about the UI confirming + the list refetching). E2E: after activate,
the current marker moves and a toast/confirmation appears.

## A5 — "Nuova versione" / "Sovrascrivi" applies once, no ask-loop

**Bug:** confirming the large-edit ask card ("Nuova versione" or "Sovrascrivi")
produces "niente modificarsi" and Cesare keeps re-asking instead of applying.

**Root (mapped):** `commitOrAsk` resolves PER TOOL, not per turn. A turn with
multiple tools can emit a SECOND ask that overrides the user's first confirmation,
looping. Files: `apps/web/app/features/predictions/resolve-version-action.ts`,
`auto-version.effect.ts` (commitOrAsk), `cesare-document-tools.ts` (the tool seams),
`components/CesareSheet.tsx` `handleChooseVersionAction`,
`components/CesareConversation.tsx` (ask-card render).

**Fix:** confirming an action applies it ONCE and shows the result. A confirmed
overwrite/mint decision must carry through the whole turn (the confirmation is
sticky for that edit), so a second tool in the same turn does NOT re-ask the same
decision. No duplicate ask cards stacking. After apply, the chat shows the honest
result card (the entity was actually written — verify by the apply markers, never
the chat text). Unit tests on the resolution + an E2E (mock-ui) on the confirm path.

## A6 — Unified navigable SplitDrawer (Cesare + Versioni + Notifiche)

**Bug:** Cesare peek (`?peek=cesare`) and Versions (`?versions=`) are SEPARATE routed
lanes. With Cesare in split, clicking Versioni opens the versions drawer UNDER Cesare
(the BUG-N64 single-aux-lane resolver suppresses it) — the user can't see versions.

**Existing asset:** the shell already has a shared `SplitDrawer` host with a HISTORY
stack + ←/→ arrows, used ONLY for preview + notifications:
`apps/web/app/features/app-shell/split-drawer-context.tsx` (history ~148-196),
`AppShell.tsx` (`SplitDrawerHistoryNav` ~1534).

**Desired (the product contract):** ONE auxiliary split lane is a NAVIGABLE host.
Cesare, Versioni, Notifiche all open INTO it. Opening one while another is open
NAVIGATES within the same lane with browser-like history:

- The split header shows ←/→ arrows.
- Cesare open → click Versioni → versions shows in the SAME lane; ← returns to Cesare.
- ← again / → re-navigates the history stack.
- Closing the lane closes the whole host.

**Approach:** route Cesare peek + Versions through the shared SplitDrawer (new
`SplitDrawerPayload` kinds `cesare-peek` + `versions`), share the single history
stack. Keep the BUG-N64 invariant: at most ONE auxiliary lane live, the main track
always survives (never collapses to 0). This touches `AppShell.tsx` /
`split-drawer-context.tsx` / `AppLayout.tsx` / `CesarePeekLane.tsx` /
`VersionsSplitLane.tsx`. Do A6 LAST, rebased on A1-A5.

**Constraint:** Cesare sessions still open as a real central route
(`/sessions/:sessionId`), NOT inside the split — only the floating Cesare PEEK and
Versions/Notifications go through the navigable split host (see Spec 46 / CLAUDE.md
"Never conflate CesareDrawer with SplitDrawer").

**Implemented (as built):** the routed lanes stay URL-driven (`?peek=cesare` /
`?versions=` remain the deep-linkable source of truth, Spec 49), so the
A3/A4 master→detail Versions UI is untouched and Cesare-peek/Versions render in
their own lanes. The unification is a BRIDGE: `cesare-peek` + `versions` payloads
are added to the shared SplitDrawer history as NAVIGATION RECORDS (their bodies
are still painted by the routed lanes, not the host body). The deep module
`use-unified-split-navigation.ts` owns the URL↔history sync:

- Effect 1 mirrors each active routed surface into the shared stack (opening
  Versioni over Cesare PUSHES a history entry; the bell PUSHES notifications).
- Effect 2 projects the active history payload back to the URL via the pure,
  unit-tested `reconcileUrlAction` — keeping the two routed params MUTUALLY
  EXCLUSIVE (never both at once → the BUG-N64 resolver still renders one lane),
  and firing `close-host` when a lane is dismissed externally so the host
  collapses cleanly instead of re-opening.

The single `SplitDrawerHistoryNav` (react-aria `useButton` ←/→) is threaded into
the Cesare split header (new `CesareDrawer.headerNav` slot) and the Versions
header, so back/forward share one stack across all three surfaces. `_app`'s
`openCesarePeek` / `openVersions` drop the other routed param atomically.
`split-drawer-context.open` was made reference-stable (a `cursorRef`) so the
mirror effect never re-dedupes the active payload and snaps a forward navigation
back. Files: `split-drawer-context.tsx`, `use-unified-split-navigation.ts` (+
`.test.ts`), `components/AppShell.tsx`, `components/VersionsSplitLane.tsx`,
`predictions/components/CesareSheet.tsx`, `packages/ui/.../CesareDrawer.tsx`,
`routes/_app.tsx`; E2E `tests/unified-split-navigation.spec.ts`. The N64
dual-deep-link test was realigned to assert the mutual-exclusion invariant
(exactly one lane, main survives) rather than a fixed winner; under unification
the deterministic winner of a simultaneous `?versions=…&peek=cesare` deep-link is
Versions.

NOT done (deferred): the Notifiche lane participates as a host kind (the bell
pushes onto the shared history and ← returns to the prior surface), but the
Notifiche body is still the existing host-rendered `notifications` payload —
it was already part of the shared history, so no extra integration was needed.

---

## Hard constraints (every agent)

- neverthrow for expected failures; Zod single source of types; react-aria for every
  interactive primitive; CSS Modules + `--ds-*`/`--radius-*` tokens (no rogue hex / px /
  hardcoded radius); English identifiers, Italian UI copy; never expose/log the API key;
  the Cesare tracer invariant holds (reading→reasoning→writing→done).
- `pnpm fleet:check --diff main` green on your own diff before reporting done.
- Verify LIVE via chrome-devtools on the seed project; write E2E (prioritised) + unit.
- Commit `[OHW] type: …` on your branch, NO AI signatures. Do NOT merge — the Lead merges.
