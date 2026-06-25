# Auditor C — Shell · Navigation · Accessibility

Date: 2026-06-25
Base: `main` (0dd14cbf)
Scope: TopBar, LeftRail, unified SplitDrawer/peek/versions/notifications host, dashboard,
project vs user settings, command palette, route error boundary, deep-link combos,
keyboard nav / focus / ESC, ARIA, i18n leaks, console/render-loop checks.
Method: read shell/nav code + drove live (own dev server on :3012, MOCK_AI=false,
isolated browser context `auditorC`, real seed project `…000012` — navigated/read only,
never mutated the director's data).

Already-known bugs (NOT re-reported): #38, #45/#47, #48, #49, #52, #57, #59, #55/#56,
and the Cesare/screenplay sets owned by auditors A/B.

NEW findings: **9** — ALTO 1 · MEDIO 5 · BASSO 3.

---

## ALTO

### C-1 — Invalid/inaccessible project id → raw 500 storm, full stack-trace leak, no error boundary, silent broken shell

**Severity: ALTO** (combines a security leak + a resilience gap + a request storm)
**Repro (live, confirmed):** navigate to `http://localhost:3012/projects/not-a-real-uuid-zzz/soggetto`.

Observed:

1. The page renders the **normal shell with an empty Soggetto** — no branded route
   error boundary (Spec 60), no "progetto non trovato" state. A user who follows a
   stale/garbled link sees a silently broken page.
2. The server functions `getDocument` / `listSessions` / `getNarrativeProgress` throw
   an **uncaught Zod error** returned as a raw **HTTP 500** whose JSON body
   (`$error.stack`) **leaks the full server stack trace including absolute filesystem
   paths** (`/Users/valerionarcisi/personal/oh-writers/.claude/worktrees/…/apps/web/app/features/documents/server/documents.server.ts`)
   and the internal module graph. Proof: `proof-c2-invalid-project-no-boundary.png`
   - network req `reqid=4995` response body captured (validation `Invalid uuid`, full stack).
3. TanStack Query **retries the failing 500s in a storm** — the same three queries
   fire ~16× (console: `Failed to load resource: 500 … [16 times]`; network list shows
   reqid 4995→5011 hammering the same handlers). A validation (4xx-class) failure
   should fail fast, not retry.

Why it matters: Spec 60's `defaultErrorComponent` only catches **render throws**, not a
loader/query **server 500** — so this whole class slips past the boundary. The fix is at
the server-fn boundary: validation should return a typed `ResultShape` error (per the
error-handling + "fail fast" conventions), the route should surface a not-found/branded
state, and the retry policy should not retry validation failures.
Note: stack-trace exposure observed in **dev**; verify whether prod build still serializes
`$error.stack` to the client (if so the leak is production-grade).

---

## MEDIO

### C-2 — The aux-lane resize handle is a DEAD control: focusable, keyboard-operable, reports `aria-valuenow`, but never changes the panel width

**Severity: MEDIO** (confusing a11y affordance + orphaned dead code)
**Repro (live, confirmed):** open Versioni (or Notifiche, or a Cesare preview) in the
side lane → focus the `separator "Ridimensiona larghezza pannello"` → press `ArrowLeft`.
`aria-valuenow` ticks 420→421 but the grid aux track stays pinned at `480px`
(measured `grid-template-columns: 240px 560px 480px` before and after).

Root cause (traced end-to-end):

- The shell grid's 3rd track is now a **constant** `--split-aux-width: clamp(360px, 480px, 42vw)`
  after the "refound" (`AppShell.module.css:15,51-58`; AppShell.tsx:541-545).
- But the `SplitDrawer` composite is mounted with `placement="lane"` everywhere
  (`AppShell.tsx:1658,1691`, `VersionsSplitLane.tsx:310`), and
  `SplitDrawer.module.css:88-98` forces `.root[data-placement="lane"][data-state="open"] { inline-size: 100% }`,
  which **ignores** the drawer's own `--split-inline-size` / resize value.
- Yet `SplitDrawer.tsx:173-179,210` still wires `useSplitDrawerResize` (min 360, max 60vw)
  and paints the `handleLeft` drag handle + the keyboard separator
  (`use-split-drawer-resize.ts:174`). `VersionsSplitLane` still threads
  `size={{ width }}` / `onSizeChange` (lines 328-329), and AppShell still keeps the now
  vestigial `versionsLaneWidth` / `effectiveVersionsWidth` / `halfPageWidth` machinery
  (AppShell.tsx:483-493). All of it is **orphaned dead code** post-refound.

Impact: a keyboard / screen-reader user finds a labelled "resize panel width" separator
that does nothing; sighted users can grab a drag handle with no effect. Recommend
removing the handle + hook (or honouring it by feeding width back into `--split-aux-width`).

### C-3 — Forward history is LOST after a Back navigation in the shared aux lane

**Severity: MEDIO**
**Repro (live, deterministic — captured trace):**

1. Open Versioni in the lane (`?versions=…`). Back disabled, Fwd disabled.
2. Click the bell (Notifiche). Lane switches to "Notifiche Cesare", **Back enabled**,
   Fwd disabled, `?versions` dropped. ✅ (push worked)
3. Click the ← (Contenuto precedente) arrow. Lane returns to "Versioni", `?versions`
   re-asserted in URL. ✅ BUT **Forward arrow is now DISABLED** — the Notifiche entry
   was dropped, so the user cannot → forward back to Notifiche.

Captured: `after-bell {back:enabled, fwd:disabled}` → `after-back {back:disabled, fwd:disabled}`.
Expected after a back: `{back:disabled, fwd:ENABLED}`.
Proof: `proof-c1-forward-history-lost.png`.

Suspected mechanism: `back()` (split-drawer-context.tsx:251-257) moves the cursor with
`navIntent`, then Effect-2 re-asserts `?versions` → router nav → Effect-1 calls
`open({kind:'versions'})` (use-unified-split-navigation.ts:228-236). The routed
re-mirror collapses/loses the forward (Notifiche) entry. No console error; the history
stack and the routed re-mirror disagree. Browser-like ←/→ is the headline feature of the
unified host (Spec 78 A6); losing forward breaks it.

### C-4 — Command palette: focus is NOT restored to the trigger on close (lands on `<body>`)

**Severity: MEDIO** (a11y — keyboard users lose their place)
**Repro (live):** ⌘K to open the palette → `Esc` to close → `document.activeElement` is
`BODY`, not the "Cerca ⌘K" trigger. A keyboard user is dumped at the top of the tab order.
The palette uses a native `<dialog showModal()>` with hand-rolled keyboard handling and
no react-aria `useDialog`/`FocusScope`/focus-restore (`CommandPalette.tsx:104,146-166`),
against the mandatory react-aria convention. `showModal()` gives the modal trap, but
focus restoration on close is not implemented.

### C-5 — Command palette: dual/conflicting keyboard model (arrow-key activedescendant AND Tab walks every option `<button>`)

**Severity: MEDIO** (a11y)
**Repro (live):** open ⌘K. The input drives selection via `aria-activedescendant`
(arrow keys), but each result is a real `<button>` (`CommandPalette.tsx:226-229`) that is
**individually Tab-focusable** — pressing Tab walks `Vai alla Dashboard` → `Vai a Soggetto`
→ … one option at a time, a second, conflicting navigation model layered on the
arrow-key one. AT users get an ambiguous `button` + `role="option"` element and two ways
to move that disagree. Pick one model (roving tabindex OR activedescendant), not both.

### C-6 — Hardcoded Italian a11y strings inside `packages/ui` (locale-agnostic package leak)

**Severity: MEDIO** (i18n)
The shared, supposedly locale-agnostic `packages/ui` hardcodes Italian accessible names
with no override seam, so the app can never translate them:

- `use-split-drawer-resize.ts:174` — `aria-label "Ridimensiona larghezza pannello"`.
- `TopBar.tsx:183-184` — search trigger `aria-label "Cerca ⌘K"` / `title "Cerca (⌘K)"`
  (also embeds the glyph `⌘K` into the screen-reader name); it is a plain `<button>`,
  not `useButton` (the one shell icon button that skips the mandatory react-aria hook).
- `CommandPalette.tsx:181` — the dialog's accessible name `<h2>Tavolozza comandi</h2>`
  is a literal with no prop.
- `LeftRail.tsx` — `"Rinomina sessione"` (247), `"Sessione Cesare: …"` (296),
  `"Rinomina"/"Elimina"` (310/316), `"Azioni sessione: …"` (367),
  `"Fissa sidebar (⌘\)"/"Comprimi la barra laterale (⌘\)"` (603/612/725/736),
  `"Progetto: …"` (592/764).
- `ProjectSwitcherPopover.tsx:126` — footer `"Tutti i progetti"`.

---

## BASSO

### C-7 — Main lane has no min-width floor (`minmax(0,1fr)`); the N64 "never collapses below usable width" guarantee is structural-only

**Severity: BASSO** (not reproduced as a real collapse at tested widths, but the floor is absent)
`AppShell.module.css:51-57`: aux-open grid is `240px minmax(0, 1fr) var(--split-aux-width)`
with `.main { min-width: 0 }`. The N64 resolver correctly guarantees **one** aux lane, but
the survivor's grid uses `minmax(0, 1fr)` — there is no `minmax(MIN_MAIN, 1fr)` floor. At
1280–1680 the main lane measured healthy (560–800px), so no live collapse was reproduced;
flagged because the invariant text ("the main track never collapses below a usable width")
is enforced only by the constant aux clamp, not by an explicit main-lane minimum. A
narrower viewport or a future wider aux clamp could starve it.

### C-8 — `ProjectSwitcherPopover` ESC works only when focus is inside; no `useOverlay`/outside-click dismiss

**Severity: BASSO** (a11y/UX, code-read)
`ProjectSwitcherPopover.tsx:49-73,81` handles ESC via an `onKeyDown` on the listbox, so
ESC only fires while focus is inside it; there is no `useOverlay`/`useInteractOutside`, so
clicking outside does not close it (relies entirely on the caller). The footer
"Tutti i progetti" button sits inside the keydown container but outside the
roving-`focusIndex` listbox, so arrow-key roving never reaches it and Tab lands on it
inconsistently.

### C-9 — `<main id="main-content">` skip-link target is not focusable

**Severity: BASSO** (a11y)
`SkipLink` points at `#main-content` (`AppShell.tsx:1475` renders the `<main>`), but the
`<main>` has no `tabIndex={-1}`, so following the skip link moves the viewport but not
keyboard focus in several browsers. Add `tabIndex={-1}` to the target.

---

## Checked and OK (no bug — recorded so they aren't re-audited)

- **N64 deep-link mutual exclusion:** `?peek=cesare&versions=…` together resolves to a
  single lane (Versions wins, `?peek` dropped, `?vkind` added). Main lane stayed 800px at 1280. No two-lane render, no main collapse, no console error.
- **Shared-history Back round-trip (URL re-assertion):** Versioni→Notifiche→Back correctly
  re-adds `?versions` to the URL and re-renders the Versions lane (only the _forward_
  entry is lost — see C-3).
- **Project vs user settings (Spec 55):** avatar/"Profilo" → `/settings` (user); gear/
  "Impostazioni" → `/projects/:id/settings` (project). Distinct, correct.
- **TopBar account zone at 1680:** search/bell/profile/gear evenly spaced (x 1528→1658),
  no clip/overflow/overlap; right edge 1658 < 1680.
- **Command palette modality + name:** the a11y tree exposes `dialog "Tavolozza comandi" modal`
  with focus on the search input and ESC dismiss working (native `showModal()`); the
  trap itself holds (Tab cycles within the palette). Only focus-restore (C-4) and the dual
  model (C-5) are problems.
- **Project settings page:** clean Italian copy, no i18n key leaks.

---

## Proof artifacts

- `docs/audits/2026-06-25/proof-c1-forward-history-lost.png`
- `docs/audits/2026-06-25/proof-c2-invalid-project-no-boundary.png`
- C-1 server 500 body (stack-trace leak) captured live from `reqid=4995`.
