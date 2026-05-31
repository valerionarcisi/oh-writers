# Audit C — Localisation (IT) + Visible Bugs

**Date:** 2026-05-31
**Auditor:** QA localisation + bug sweep
**Build:** branch based on `main` (HEAD `d2c7f42`), `MOCK_AI=true`, dev server on :3012
**Method:** live drive via Playwright, every page visited, console errors collected per page, English strings traced back to source with `grep`.
**Audience target:** Italian screenwriters / directors. UI copy must be Italian; only English allowed in code identifiers (never user-facing).

Screenshots: `docs/audits/2026-05-31/screenshots-C-l10n/`

Overall: the product is very well localised. Most leaks are isolated label maps that were never translated, plus a handful of `title`/`aria-label` attributes. The single most serious issue is **not** localisation — it is an infinite render loop on the screenplay editor (Section 2, BUG-1).

---

## 1. Localisation table (English leak → correct Italian)

Priority: **P1** = primary visible label on a core page; **P2** = secondary/filter/badge label; **P3** = `title`/`aria-label` (screen-reader / tooltip only).

| #   | Pri | English string                                               | Where it appears (page / UI)                                                                           | File : line                                                                                                                                                                                                    | Correct Italian                                                                                                                                   |
| --- | --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | P1  | `Scene` `Action` `Character` `Dialogue` `Paren` `Transition` | Screenplay editor — element legend chips (top toolbar)                                                 | `apps/web/app/features/screenplay-editor/components/ScreenplayElementChips.tsx:10-17`                                                                                                                          | `Scena` `Azione` `Personaggio` `Dialogo` `Parentetica` `Transizione`                                                                              |
| L2  | P2  | `Action` `Character` `Dialogue` `Transition`                 | Same labels duplicated in the toolbar map                                                              | `apps/web/app/features/screenplay-editor/components/ScreenplayToolbar.tsx:11-15`                                                                                                                               | `Azione` `Personaggio` `Dialogo` `Transizione`                                                                                                    |
| L3  | P2  | `Scene` `Action` `Character` `Dialogue` `Paren`              | Slash `/` element picker (insert menu)                                                                 | `apps/web/app/features/screenplay-editor/lib/fountain-element-picker.ts:30-34`                                                                                                                                 | `Scena` `Azione` `Personaggio` `Dialogo` `Parentetica`                                                                                            |
| L4  | P1  | `Screenplay`                                                 | Project overview → "Pipeline di sviluppo" stage chip (sidebar nav already says "Sceneggiatura")        | `apps/web/app/features/projects/components/overview/ProjectPipeline.tsx:131`                                                                                                                                   | `Sceneggiatura`                                                                                                                                   |
| L5  | P1  | `Synopsis` `Outline` `Treatment`                             | Project overview → "Sviluppo narrativo" card `<h3>` titles (the badge above each card is correctly IT) | render: `apps/web/app/features/projects/components/overview/NarrativeCardGrid.tsx:82` (`{doc.title}`); root cause seed: `packages/db/src/seed/index.ts:297,304,311` (and 469-483, 589+) writes English `title` | Card heading should use the IT `TYPE_LABEL[doc.type]` (`Sinossi`/`Scaletta`/`Trattamento`), not the raw stored `doc.title`. Also fix seed titles. |
| L6  | P1  | `Strip Board`                                                | Calendario (schedule) → first view tab                                                                 | `apps/web/app/features/schedule/components/SchedulePage.tsx:56`                                                                                                                                                | `Spannografo` (IT industry term) — or `Piano scene` if you prefer plain                                                                           |
| L7  | P1  | `contingency` (`contingency 0% inclusa`)                     | Budget → "Totale stimato" sub-line                                                                     | `apps/web/app/features/budget/components/overview/OverviewSection.tsx:100`                                                                                                                                     | `imprevisti`                                                                                                                                      |
| L8  | P1  | `Production`                                                 | Budget → category term in the summary grid                                                             | `apps/web/app/features/budget/components/overview/OverviewSection.tsx:139`                                                                                                                                     | `Produzione`                                                                                                                                      |
| L9  | P1  | `Contingency`                                                | Budget → category term in the summary grid                                                             | `apps/web/app/features/budget/components/overview/OverviewSection.tsx:145`                                                                                                                                     | `Imprevisti`                                                                                                                                      |
| L10 | P2  | `Contingenza` (inconsistent with `imprevisti`)               | Budget → "Settimane" view category map                                                                 | `apps/web/app/features/budget/components/BudgetWeeklyView.tsx:28`                                                                                                                                              | Standardise to `Imprevisti` across the budget feature (L7/L9/L10 must all match)                                                                  |
| L11 | P2  | `crew` (`…pre-popolare cast e crew…`)                        | Budget → "Per categoria" empty-state helper text                                                       | `apps/web/app/features/budget/components/RateCardSection.tsx:203`                                                                                                                                              | `troupe` (app uses "Troupe" everywhere else)                                                                                                      |
| L12 | P2  | `Locations`                                                  | Breakdown → "Sottolinea" category filter + chips                                                       | `apps/web/app/features/breakdown/components/BreakdownPage.tsx:92`                                                                                                                                              | `Location` (sing./invariant, as used in the sidebar)                                                                                              |
| L13 | P2  | `Props`                                                      | Breakdown → "Sottolinea" category filter + chips (the recap strip already says "Oggetti")              | `apps/web/app/features/breakdown/components/BreakdownPage.tsx:98`                                                                                                                                              | `Oggetti di scena` (or `Attrezzeria`) — and align with the recap "Oggetti"                                                                        |
| L14 | P2  | `Owner` `Editor` `Viewer`                                    | Dashboard → role filter dropdown                                                                       | `apps/web/app/features/projects/components/dashboard/DashboardFilters.tsx:51-53`                                                                                                                               | `Proprietario` `Redattore` `Visualizzatore` (or keep `Editor` if preferred, but `Owner`/`Viewer` must go)                                         |
| L15 | P2  | `Owner` `Editor` `Viewer`                                    | Dashboard → project card role badge (grid view)                                                        | `apps/web/app/features/projects/components/dashboard/ProjectCardGrid.tsx:31-33`                                                                                                                                | `Proprietario` / `Redattore` / `Visualizzatore`                                                                                                   |
| L16 | P2  | `Owner` `Editor` `Viewer`                                    | Dashboard → project card role badge (compact/list view)                                                | `apps/web/app/features/projects/components/dashboard/ProjectCardCompact.tsx:31-33`                                                                                                                             | `Proprietario` / `Redattore` / `Visualizzatore`                                                                                                   |
| L17 | P2  | `owner` (raw enum)                                           | Settings → "Team" section, member role badge                                                           | `apps/web/app/features/user-settings/components/UserSettingsPage.tsx:380` (`{team.role}`)                                                                                                                      | map enum → `Proprietario` etc. (never render the raw enum)                                                                                        |
| L18 | P2  | `Import PDF`                                                 | Screenplay editor → toolbar "…" menu item                                                              | `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx:119`                                                                                                                                       | `Importa PDF`                                                                                                                                     |
| L19 | P3  | `Renumber every scene based on document order`               | Screenplay editor → "Ricalcola numerazione scene" item `title=` tooltip (label is IT, tooltip is EN)   | `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx:142`                                                                                                                                       | `Rinumera tutte le scene secondo l'ordine del documento`                                                                                          |
| L20 | P2  | `shot` (`…iniziare a pianificare gli shot.`)                 | Inquadrature (shooting-plan) → empty-state text (page uses "inquadrature" everywhere else)             | `apps/web/app/features/shooting-plan/components/ShootingPlanPage.tsx:383-384`                                                                                                                                  | `inquadrature`                                                                                                                                    |
| L21 | P2  | `AI Assistant`                                               | Documents → AI assistant panel title                                                                   | `apps/web/app/features/documents/components/AIAssistantPanel.tsx:44`                                                                                                                                           | `Assistente AI` (or `Cesare`)                                                                                                                     |
| L22 | P3  | `Cesare assistant` (aria-label, default prop)                | Cesare floating drawer landmark name (screen readers announce English)                                 | `packages/ui/src/composites/CesareDrawer/CesareDrawer.tsx:262`                                                                                                                                                 | `Assistente Cesare`                                                                                                                               |
| L23 | P3  | `Screenplay not found.`                                      | Screenplay editor / VersionsPanel error fallbacks (user-facing on error)                               | `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:337`; `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx:73`                                                       | `Sceneggiatura non trovata.`                                                                                                                      |

### Terminology notes for an Italian professional (not strictly bugs)

- **`Breakdown`** is used as the feature name in the sidebar, overview, locations ("Sincronizza da breakdown") and budget, while the verb form correctly uses **"spoglio"** / "scena spogliata" / "Avvia spoglio". An Italian AD says _spoglio_ for the document. Recommend renaming the feature to **"Spoglio"** for consistency, or — if "Breakdown" is a deliberate product choice — at least make it consistent and stop mixing the two. Decide once.
- **`magic hour`** (schedule) — kept in English; this is an accepted international set term, fine to leave.
- **`cartella`** (soggetto: "1 cartella · 390 caratteri") — correct Italian unit for a page of prose. Good.
- **`Cast`** (breakdown/budget) — accepted loanword in IT productions. Fine.
- **`Troupe`** — correct IT term. Good (which is exactly why L11 "crew" is wrong).
- Document terms **`soggetto` / `sinossi` / `scaletta` / `trattamento`** are all correct IT screenwriting vocabulary and used correctly. The only failure is that the overview card _renders the stored English `title`_ (L5) instead of the IT label it already has.

---

## 2. Bugs (prioritised)

### ALTO

**BUG-1 — Infinite render loop on the screenplay editor ("Maximum update depth exceeded").**

- **Page:** `/projects/:id/screenplay` (editable Monaco/ProseMirror editor).
- **Symptom:** On every load, React throws `Maximum update depth exceeded` continuously — 180-200+ identical errors per page view, count keeps climbing while the page is open (clearly a `setState`-in-`useEffect` loop). The editor _does_ render its content, so it looks fine to the eye, but the page is pinning a re-render cycle.
- **Console:** `Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.` (react-dom).
- **Scope:** Specific to the **editable** screenplay editor. The same screenplay prose is embedded read-only in Breakdown (0 errors), Budget (0), Locations (0) and the routed Cesare session page (0) — none loop. So the culprit is an effect in the editor shell, not the shared view.
- **Likely site:** `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx` (multiple `useEffect` at lines 302/507-540/581/673/683 — one has an unstable dependency or unconditional setState). The repo already carries fixes for the same class of bug on `/sessions/:id` (commits `d2c7f42`, `28d6628`) — this editor instance was not covered.
- **Screenshot:** `screenshots-C-l10n/04-screenplay.png`, `04b-screenplay-loop.png`.
- **Impact:** battery/CPU drain, dropped interactions, and it appears correlated with the session-cookie drops seen during the audit (see BUG-3). Highest priority.

### MEDIO

**BUG-2 — Invalid nested `<button>` → hydration error on Calendario (schedule).**

- **Page:** `/projects/:id/schedule` (Strip Board view).
- **Symptom:** 2 console errors on load: `In HTML, <button> cannot be a descendant of <button>. This will cause a hydration error.` The day-card controls render a `<button>` inside another `<button>` ("Aggiungi scena" wraps a nested "Aggiungi scena"; same for "Rimuovi scena").
- **Console:** `In HTML, %s cannot be a descendant of <%s>` / `<%s> cannot contain a nested %s` (button/button).
- **Site (to confirm):** day-card header controls in the schedule components (`apps/web/app/features/schedule/components/` — the day card / `StripBoard` day header). Replace the outer or inner button with a non-button element.
- **Impact:** hydration mismatch + invalid a11y semantics (button-in-button is not operable by assistive tech). Screenshot: `screenshots-C-l10n/07-schedule.png`.

**BUG-3 — Auth session is fragile; user gets silently logged out mid-navigation.**

- **Symptom:** Several times during the audit, navigating between project pages bounced to `/login` even though a valid `better-auth.session_token` cookie had just been set. Re-login fixed it each time. Appears correlated with time spent on the screenplay editor (BUG-1) — the loop may be firing repeated session/refresh server calls that race or invalidate the cookie.
- **Repro:** not 100% deterministic; happened ~4× across the session, at least once right after visiting `/screenplay`.
- **Impact:** silent failure / data-loss risk for a writer mid-edit. Worth investigating together with BUG-1 (likely the same root cause). MEDIO because it's intermittent and recoverable, but it's the kind of thing that destroys trust.

### BASSO

**BUG-4 — `favicon.ico` 404 on every page.**

- **Symptom:** `GET /favicon.ico 404` console error site-wide. Cosmetic, but it's a console-error on every single page. Add a favicon.

**BUG-5 — Login brand "OOh Writers" at the email step.**

- **Symptom:** On the first login step the brand reads "OOh Writers" because the `O` logo glyph sits flush against the "Oh Writers" wordmark with no separating space/element (the password step renders them as two separated nodes and looks correct). Pure cosmetic spacing nit on `/login` step 1.

---

## 3. Pages visited — console error count

| Page                                         | English leaks                                                                                     | Console errors              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------- |
| `/login`                                     | 0 (BUG-5 cosmetic)                                                                                | 1 (favicon 404)             |
| `/dashboard`                                 | L14-L16 (role badges/filter)                                                                      | 1 (favicon)                 |
| `/projects/:id` (overview)                   | L4, L5                                                                                            | 0                           |
| `/projects/:id/soggetto`                     | 0                                                                                                 | 0                           |
| `/projects/:id/synopsis`                     | 0                                                                                                 | 0                           |
| `/projects/:id/outline` (scaletta)           | 0                                                                                                 | 0                           |
| `/projects/:id/treatment`                    | 0                                                                                                 | 0                           |
| `/projects/:id/screenplay`                   | L1, L2, L3, L18, L19, L23                                                                         | **180-200+ (BUG-1 loop)**   |
| `/projects/:id/breakdown`                    | L12, L13                                                                                          | 0                           |
| `/projects/:id/budget`                       | L7, L8, L9, L10, L11                                                                              | 0                           |
| `/projects/:id/schedule` (calendario)        | L6                                                                                                | **2 (BUG-2 nested button)** |
| `/projects/:id/locations`                    | 0                                                                                                 | 0                           |
| `/projects/:id/shooting-plan` (inquadrature) | L20                                                                                               | 0                           |
| Cesare floating drawer                       | L21, L22                                                                                          | 0                           |
| Cesare full session page `/sessions/:id`     | 0                                                                                                 | 0                           |
| Cesare agentic edit (inline trace)           | 0 — trace fully IT ("1 passaggio", "Aggiornato Soggetto", "Mostra/Nascondi modifiche", "Annulla") | 0                           |
| `/settings`                                  | L17                                                                                               | 0                           |
| Notifications panel                          | 0                                                                                                 | 0                           |
| Command palette (⌘K)                         | 0                                                                                                 | 0                           |

(Benign `@tanstack/start` "package has moved" deprecation warnings appear on every page — not counted as errors.)

---

## 4. What's already good (so a fix doesn't regress it)

- Auth (login/password steps), dashboard chrome, all four narrative editors, scaletta empty-state, locations, command palette, notifications, settings, and the **entire Cesare agentic-edit inline trace** are correctly and naturally Italian.
- The Cesare agentic edit works end-to-end in mock mode: live document update + auto-version + compact trace + working "Mostra/Nascondi modifiche" diff toggle + "Annulla", all in Italian.
- IT screenwriting vocabulary (soggetto/sinossi/scaletta/trattamento, cartella, troupe, magic hour, sopralluogo, spoglio) is used correctly — the leaks are isolated untranslated label maps, not a vocabulary problem.
