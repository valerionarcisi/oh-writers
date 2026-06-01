# Audit iter-4 — CONFIRMATION pass (2026-06-01)

Single SERIAL, DB-backed, gate-compliant confirmation pass on **main HEAD `08b037e`**, intended to
confirm the fix→audit loop has converged (iter3 + iter4 both clean → loop closes).

## Setup / stale guard

- `git fetch` + `git reset --hard main` → HEAD `08b037e` ✓
- R1/R2 marker: `packages/ui/src/components/DropdownMenu.tsx` has a `triggerDisabled` prop
  (`:53`, `:280`, `:299`) ✓
- R3 marker: `apps/web/app/features/predictions/cesare-intent-classifier.test.ts` exists; the intent
  classifier `cesare-intent-classifier.ts` is present with the shared catalogue + 0.55 confidence
  gate (17 `it()` blocks — the "~87" in the brief is an over-estimate, but the file and behaviour
  it proves are present). ✓
- `pnpm install` (up to date) · `packages/db` built · `packages/ui` has no build step (consumed as
  source — expected) · `pnpm test:setup` seeded the DB.
- ONE dev server on `:3002` (`MOCK_AI=true`), ONE browser session, login `test@ohwriters.dev`,
  project `…011`. Agentic actions verified against the `oh-writers_test` DB.

Note on method: under `MOCK_AI=true` the intent classifier is deliberately skipped
(`cesare-intent-classifier.ts:300`), so the R3 dispatch behaviour exercised here is driven by the
MOCK_AI scripted scenarios (`_mocks/cesare-tool-loop.mock.ts`), which is the correct surface for a
mock-mode confirmation.

## Coverage (what was exercised)

Schedule (R1) · ⌘K palette + section jump (R2) · Cesare SESSION free-language dispatch + DB writes
(R3) · question-stays-chat (R3) · screenplay editor render-loop · soggetto Mostra `[data-diff-op]`
flash · write-from-zero narrative chain (sinossi/scaletta/trattamento) · entity labels ·
`?versions=` deep-link (bare + valid id) · l10n across dashboard / overview / screenplay legend /
budget / schedule / breakdown / title-page · spot tour: locations, shots, sessions/new composer.

---

## (1) REGRESSIONS

One regression found.

### REG-1 — Bare `?versions=` deep-link crashes the entire app shell  · ALTO

**Proof (live, reproduced twice + on two routes):**
`/projects/…011/soggetto?versions=` and `/projects/…011/treatment?versions=` both render the error
boundary "Something went wrong!" with
`TypeError: Cannot destructure property 'user' of 'Route.useLoaderData(...)' as it is undefined.`
(`<AppLayout>`). Screenshot: `screenshots/REGRESSION-bare-versions-crash.png`. A control nav to
`/dashboard` immediately before and after confirms the session is valid — this is NOT a logout
artifact. A **valid** `?versions=<uuid>` loads fine and opens the "Versioni" dialog (0 errors).

**Root cause (file:line):**
`apps/web/app/features/app-shell/versions-peek.ts:94` —
`versions: z.string().min(1).optional()`. This schema is merged into the `_app` **layout** route's
`validateSearch` (`apps/web/app/routes/_app.tsx:50,53`). A bare `?versions=` yields the empty
string `""`, which is not `undefined`, so `.optional()` does not save it and `.min(1)` **rejects**
it. `validateSearch` throwing on the layout route means its loader (which provides `user`) never
resolves, so `_app.tsx:190 const { user } = Route.useLoaderData()` destructures `undefined` → crash.

The conflict is internal: `parseVersionsPeek` (`versions-peek.ts:124-126`) is *explicitly designed*
to treat an empty `versions` param as `err("empty")` and "fail closed (render host alone)"
(file comment `:111-112`), and the schema doc (`:88`) says content is "validated in
parseVersionsPeek" — but `.min(1)` rejects the value at the router layer before the graceful path is
ever reached.

**Why ALTO:** a documented deep-link shape (`?versions=`) takes down the whole app shell via the
error boundary, not just the Versions feature; it directly breaks the iter-1/2 acceptance criterion
"bare `?versions=` shows vs-current diff". Trigger is the empty-value edge (manual URL / a stripped
shared link), not the primary in-app path (the in-app "Versioni" entry always sets a valid UUID), so
likelihood is moderate — but blast radius is the entire shell.

**Fix:** relax the shape check so the empty string survives router validation and lets
`parseVersionsPeek` fail closed as designed. e.g. in `versionsSearchSchema`
`versions: z.string().optional()` (drop `.min(1)`), or `z.string().min(1).optional().catch(undefined)`
/ `.or(z.literal("")).optional()`. Apply the same to `vcur`/`compare` for consistency (they share the
`.min(1)` pattern; their parsers already fail-closed on empty). No product behaviour change for valid
ids; bare `?versions=` then renders the host page alone (vs-current), per the documented contract.

### Regressions that did NOT recur (all PASS)

- **R1 — /schedule button-in-button / hydration:** 0 console errors; the only 3 warnings are the
  benign `@tanstack/start` package-move notices. The day header is a non-button `generic` with a
  nested "Rimuovi giorno" button (no button-in-button). Opening day details throws nothing.
  (`screenshots/r1-schedule-clean.png`)
- **R2 — ⌘K palette:** lists Dashboard + all project sections (Soggetto…Inquadrature) + "Apri Cesare"
  + "Nuova sessione Cesare". "Vai a Budget" navigated to `/budget`, 0 errors.
  (`screenshots/r2-palette.png`)
- **R3 — free-language dispatch in a Cesare SESSION (DB-verified):**
  - "Buttami giù la logline" → tool dispatched, logline DB `len 50→166`, version `1→2`, card
    "Aggiornata Logline".
  - "Scrivi il soggetto" → soggetto DB `len 1118→390` (v2), version `1→2`, card "Aggiornato Soggetto".
  - "Rendi il soggetto più asciutto" (clean session) → soggetto DB `len 1139→390`, version `2→3`,
    logline **unchanged**, card "Aggiornato Soggetto"; Mostra → split drawer "Vai a soggetto
    (replace)" (correct entity).
  - "Di cosa parla questo soggetto?" → **no** dispatch, stays chat ("Ho letto la tua richiesta ma
    non ho strumenti specifici da invocare"), DB unchanged (`len 1139`, version 2, same timestamp).
- **Screenplay editor render loop:** `/screenplay` → 0 errors, **0** "Maximum update depth" after 8s,
  27 scene/line elements rendered. (`screenshots/screenplay-no-loop.png`)
- **Soggetto Mostra `[data-diff-op]` flash:** `apply_text_edit` (traduttrice→interprete) applied live
  (DB `len 1118→1139`, version `1→2`, "interprete simultanea" in DB); "Mostra modifiche" rendered
  **5 `[data-diff-op]` spans** in the document. (`body[data-cesare-diff]=null` is expected 47e.)
- **Write-from-zero chain:** sinossi `0→871`/v1, scaletta `0→2009`/v1, trattamento `0→943`/v1 — each
  DB 0→>0 + a version, each correctly labelled ("Aggiornata Sinossi/Scaletta", "Aggiornato Trattamento").
- **Honest card:** no-op question produced no success card; every write produced an
  "Apri il pannello Versioni…" message (no stale "usa Annulla").
- **Entity labels:** every card named the actually-edited entity (Logline / Soggetto / Sinossi /
  Scaletta / Trattamento). No mislabelling.
- **Valid `?versions=<id>`:** opens the "Versioni" dialog, 0 errors, no raw `<p>` leak.
- **l10n (IT):** screenplay element chips Scena/Azione/Personaggio/Dialogo/Parentetica/Transizione;
  title-page Autore/Tratto da/Note/Contatti; dashboard/overview/budget/schedule/breakdown clean. The
  two "Editor"/"Viewer" hits are NOT leaks — "Editor" is the accepted IT role-`<option>` term (per
  the iter3 role decision) and "Viewer User" is a seeded account display name.

---

## (2) NEW findings (non-regression)

**None ALTO/MEDIO.** No new defects surfaced across the five perspectives (novice / expert /
cesare-only / feature-coverage / l10n) beyond REG-1 above.

### Known / deferred (NOT new — confirmed still as-documented)

- "1 modific**h**a in sospeso" typo in the split-drawer pending tray (BASSO, already in backlog).
- Favicon / page-resource 404 site-wide (e.g. on `/shots`) — the known BASSO; page renders fine.
- iter3 #13 "two Cesare composers" is **fixed**: on a fresh `/sessions/new` the floating drawer is
  `display:none` (0×0), only the landing composer is visible
  (`screenshots/sessions-new-single-composer.png`).
- Under `MOCK_AI`, a genuine question yields the generic "non ho strumenti…" fallback rather than a
  prose answer — a mock-scenario artifact (no scripted answer turn), not a product defect; the
  load-bearing behaviour (no dispatch, no DB change, stays chat) holds.

---

## (3) CONVERGENCE VERDICT

**This iteration is NOT clean.** One ALTO regression (REG-1: bare `?versions=` crashes the app
shell) was found and reproduced live with a precise root cause and fix.

**The loop has NOT converged.** REG-1 must be fixed and a follow-up confirmation pass run. Once
REG-1 is resolved and a subsequent iteration is clean, the next clean iteration after that would be
the second consecutive clean pass that closes the loop.

Everything else — the entire R1/R2/R3 fix set, the iter-1/2 acceptance items, and l10n — held up.
The regression is narrow (a single over-strict `.min(1)` on a layout-route search param) and the
fix is one line in `versions-peek.ts`.
