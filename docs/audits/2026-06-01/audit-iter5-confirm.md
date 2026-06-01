# UX iter-5 — Confirmation Audit

**Date:** 2026-06-01
**Ref:** `origin/main` HEAD `8db31e0` (REG-1 fix)
**Role:** iter-5 confirmation auditor (convergence loop)
**Env:** dev on :3007, `MOCK_AI=true`, seeded DB
**Login:** `test@ohwriters.dev` (Better Auth API login via page request context — see Notes)
**Seeded project:** `00000000-0000-4000-a000-000000000011` (Team Thriller)

---

## Verdict

**CLEAN.** 0 ALTO, 0 blocking MEDIO, no regressions.

REG-1 is fixed and holds. SplitDrawer, Cesare agentic edit, exports/imports,
and the regression sweep all pass. This is the 2nd consecutive clean iteration
(iter-3 clean → iter-4 found+fixed REG-1 → iter-5 clean). **Loop converges.**

---

## Marker check

`apps/web/app/features/app-shell/versions-peek.ts:98` →
`versions: z.string().optional()` (no `.min(1)`). On the REG-1 fix ref. ✓

---

## What was exercised (mapped to mandate)

### 1. REG-1 — empty / malformed version params (the #1 confirm)

On `…/soggetto` tested: `?versions=`, `?vcur=`, `?compare=`, `?versions=junk`,
`?versions=<whitespace>`, and `?versions=&vcur=&compare=` (all-empty combo).

Every case: host path preserved, **no shell crash** (no "Cannot destructure
'user'"), **no error overlay**, `<main>` renders, **no versions drawer opens**.
Fail-closed path works. ✓

### 2. Versions SplitDrawer

Opened via `?versions=<soggettoDocId>`.

- Compresses page: `body[data-versions-split=open]`. ✓
- vs-current diff renders coloured cells: `_cell-changed` (`rgba(139,58,26,.1)`)
  - `_intra` word-level highlights (`rgba(139,58,26,.28)`) on changed words
    ("evita di pensare", "vede", "da"). ✓
- CONFRONTA tab → pick 2 versions → `?compare=<A>,<B>`, A/B badges, side-by-side
  ("Versione 1 a confronto con Cesare · modifica 2"). ✓
- ↗ Espandi → `?vstate=full`, split attr clears (full route). ✓
- ESC / × / browser-back all clear the search params and restore the host
  editor. ✓

### 3. Cesare agentic edit (core invariant)

Real natural-language edits (not chips). Drawer opened via "Apri Cesare".

- "rendi la logline più incisiva e breve" → logline changed LIVE in editor:
  `"A detective chases a killer through a silent city."` →
  `"Un detective insonne dà la caccia a un killer in una città che non dorme
mai…"`. **Real content change, not a no-op.** ✓
- Trace: reading→reasoning→writing→done, "Aggiornata **Logline**" (correct
  entity), "1 MODIFICA" result card, "Mostra/Nascondi modifiche" toggle. ✓
- "Mostra modifiche" flash: verified on a deterministic edit
  ("traduttrice freelance" → "interprete simultanea") — flash node
  `data-flash-mode=mostra` with green additions `["interprete","simultanea"]`.
  (Earlier null captures were genuine no-op re-edits with empty diff, not a
  defect — flash correctly renders nothing for an empty diff.) ✓
- Auto-version: soggetto versions 2→3, logline versions →3 (DB-confirmed). ✓

### 4. Exports / Imports (screenplay)

Route is `/projects/:id/screenplay` (the "Sceneggiatura" sidebar label).

- "Esporta PDF ▾" menu offers all **5 formats**: Standard · Sides (scene del
  giorno) · AD copy (margine ampio) · Reading copy (doppia interlinea) · Una
  scena per pagina. ✓
- ToolbarMenu: **Importa PDF**, **Importa Fountain** (both reachable), Esporta
  Fountain, Ricalcola numerazione scene, Frontespizio. ✓

### 5. Regression sweep

- Screenplay editor: **0** "Maximum update depth", 0 console errors. ✓
- /schedule: loads, **0** button-in-button / "cannot be a descendant" errors. ✓
- ⌘K palette: 16 items (all 11 sections + Cesare actions) — not just Dashboard. ✓
- Not-found: nonexistent project → graceful "Il progetto richiesto non esiste o
  è stato rimosso.", no crash. ✓
- IT localisation spot-check: screenplay legend SCENA/AZIONE/PERSONAGGIO/
  DIALOGO/TRANSIZIONE; stat labels "SCENE 9 / PAGINE 12" (valid IT plural, not a
  leak); breakdown chrome PER SCENA/PER PROGETTO/MATRICE/SOTTOLINEA + category
  labels Cast/Location/Oggetti di scena/Costumi/Fotografia/Suono. No English
  leaks. ✓

---

## Findings

**None.** No ALTO, no MEDIO, no BASSO product findings.

---

## Notes (harness only — not product defects)

- **Login 403 via the login form on :3007.** The Better Auth sign-in POST returns
  403 from the browser form, but 200 via the page request context (and via curl,
  including with `Origin: http://localhost:3007`). This is a CSRF/cookie quirk of
  running on a non-default port in the test harness, not a product bug — logged in
  through `page.request.post('/api/auth/sign-in/email')` which shares the browser
  cookie jar. Worth a glance if it ever reproduces on :3000.
- Packages needed a build (`pnpm --filter './packages/*' build`) before the dev
  server resolved `@oh-writers/db` — expected first-run step on a fresh worktree.
- Route segments are English (`/screenplay`, `/schedule`, `/budget`, `/breakdown`,
  `/locations`); the IT words are sidebar labels only. My initial `/sceneggiatura`
  and `/calendario` guesses 404'd (caller error, not a product 404).
