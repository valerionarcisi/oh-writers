# Design audit post-Wave 4

Audit eseguito live su `http://localhost:3000` (utente Valerio, progetto `Non fa ridere` `00000000-0000-4000-a000-000000000012`), pagine Dashboard, Project Overview, Screenplay, Soggetto, Breakdown, Budget (Panoramica + Settimane), Schedule, Shooting Plan, Locations. Screenshot in `/Users/valerionarcisi/personal/oh-writers/vernissage/recap/screenshots/audit-*.png`.

## Tema atteso

Oh Writers ha tema **light "linen"** definito in `packages/ui/src/tokens/semantic.css` e `packages/ui/src/themes/linen.css`:

- `--ds-bg`: `--ds-linen-50` (#f5f3ee, fondo pagina)
- `--ds-surface`: `--ds-white` (#ffffff, card)
- `--ds-surface-alt`: `--ds-linen-100` (#ebe9e3, sunken)
- `--ds-surface-deep`: `--ds-linen-200` (#e2dfd6)
- `--ds-text`: `--ds-linen-800` (#1c1a17 — quasi nero, va usato SOLO come colore testo, mai come background)
- `--ds-text-2`: linen-700; `--ds-text-3` / `--ds-text-mute`: linen-600 (#6e6c66); `--ds-text-faint`: linen-500
- `--ds-line`: linen-300 (#d8d6cd) border default
- `--ds-action`: clay-500 (#8b3a1a) primary CTA
- `--ds-agent`: leaf-500 (#5a6b3c) Cesare

### Root cause cross-cutting (alla base di S1 e di gran parte di S2)

`packages/ui/src/styles/tokens.css` definisce un **set di token "legacy" pensati per tema DARK** (`--color-bg: #0a0a0a`, `--color-surface: #111`, `--color-elevated: #1a1a1a`, `--color-fg: #f0f0ef`, `--color-border: rgba(255,255,255,0.07)`, ecc.). `packages/ui/src/themes/linen.css` **NON sovrascrive** queste variabili (solo `--color-accent`, `--color-accent-hover/-subtle/-border`, `--color-border-focus`, `--ring-focus`).

Risultato: ogni `var(--color-surface)` / `var(--color-bg)` / `var(--color-fg)` / `var(--color-border)` rimasto in un .module.css o .tsx resta **dark mode** dentro un'app light. Da qui i finding S1 più gravi.

File ancora ancorati ai legacy `--color-*`:

- `apps/web/app/features/budget/components/BudgetCapBar.module.css`
- `apps/web/app/features/budget/components/BudgetWeeklyView.module.css`
- `apps/web/app/features/budget/components/widgets/BudgetGauge.tsx`
- `apps/web/app/features/budget/components/widgets/BudgetDonut.tsx`
- `apps/web/app/features/shooting-plan/components/BlockingCanvas.tsx`
- `apps/web/app/features/shooting-plan/components/BlockingPin.tsx`
- `apps/web/app/features/shooting-plan/components/blocking-editor/BlockingEditorCanvas.tsx`
- `apps/web/app/features/screenplay-editor/lib/fountain-element-picker.ts`
- `apps/web/app/features/screenplay-editor/lib/plugins/proposed-edit-decoration.module.css`
- `apps/web/app/features/user-settings/components/UserSettingsPage.module.css`
- `apps/web/app/features/app-shell/components/Sidebar.module.css` (orphan, non renderizzato)

Fix sistemico consigliato: in `linen.css` aliasare i `--color-*` legacy verso il nuovo set (es. `--color-surface: var(--ds-surface)`, `--color-bg: var(--ds-bg)`, `--color-fg: var(--ds-text)`, `--color-border: var(--ds-line)`, ecc.) OPPURE migrare ogni file alla namespace `--ds-*`. La prima opzione è il "tracer bullet" che spegne tutti i S1 con una sola edit.

---

## Findings per severità

### S1 — critical (look-and-feel rotto, fix subito)

#### 1. Budget "Tetto budget" bar è una banda nera

- **Pagina:** `/projects/:id/budget` (Panoramica + Per Categoria + Per Giornata + Settimane — è sempre visibile)
- **Componente:** `BudgetCapBar`
- **CSS:** `apps/web/app/features/budget/components/BudgetCapBar.module.css` riga 1 `.bar { background: var(--color-surface); ... }` → risolve a `#111111` (dark token), border `rgba(255,255,255,0.07)` invisibile.
- **Reale (live):** `bg: rgb(17, 17, 17)`, 1232×50px, full width sotto i tab.
- **Fix:** sostituire `var(--color-surface)` con `var(--ds-surface)` o `var(--ds-surface-alt)` (e tutti gli altri `--color-*` del file con `--ds-*` equivalenti).
- **Screenshot:** `audit-6-budget.png`.

#### 2. Budget Settimane: card "SETTIMANA 1" tutta nera

- **Pagina:** `/projects/:id/budget` tab Settimane.
- **Componente:** `BudgetWeeklyView`
- **CSS:** `apps/web/app/features/budget/components/BudgetWeeklyView.module.css` `.weekCard { background: var(--color-surface); border: 1px solid var(--color-border); }` → card 280×210px nera con bordo invisibile dentro pagina light.
- **Fix:** stesso pattern del fix 1 (mappa `--color-*` ai `--ds-*`). In più sostituire `--color-text`, `--color-text-muted`, `--shadow-sm`, `--space-*`, `--text-*` con equivalenti del DS.
- **Screenshot:** `audit-6b-budget-settimane.png`.

#### 3. Shooting Plan / Blocking canvas: tavolo nero con accenti rossi-dark

- **Pagina:** `/projects/:id/shooting-plan` dopo aver selezionato una scena.
- **Componente:** `BlockingCanvas` (preview) e `BlockingEditorCanvas` (editor)
- **File:** `apps/web/app/features/shooting-plan/components/BlockingCanvas.tsx` riga 246 `fill="var(--color-surface)"` per i piece + riga 272 `fill="var(--color-bg)"` per le aperture porte → blocchi neri (#111) con stroke `rgba(255,255,255,0.14)` quasi invisibile. Anche `BlockingPin.tsx` usa `--color-accent-green/-red` non definiti in linen.
- **Fix:** sostituire i token. I "piece" devono usare un `--ds-surface-alt` o `--ds-surface-deep` con stroke `--ds-line`. Per `--color-accent-green/-red` valutare se mappare a `--ds-success`/`--ds-danger` o a colori categoria.
- **Screenshot:** `audit-8b-shooting-plan-sc1.png`.

#### 4. Element picker (Fountain) dark popover, hardcoded

- **Pagina:** `/projects/:id/screenplay` quando si digita "/" o si attiva il picker di blocco.
- **File:** `apps/web/app/features/screenplay-editor/lib/fountain-element-picker.ts` righe 67-127. Stili inline con fallback **hardcoded dark** (`#242320`, `#2e2d2a`, `#9e9b94`, `#5c5a55`). Anche se i token venissero risolti a light, i fallback restano dark.
- **Fix:** rimpiazzare i fallback hardcoded con valori light (`#ffffff` / `#f5f3ee` per bg, `#d8d6cd` per border, `#1c1a17` per testo). Meglio ancora: passare a CSS Modules e usare `--ds-*`.
- **Screenshot:** non triggerato durante l'audit (richiede digitazione "/" in editor), ma il codice è leggibile.

#### 5. Proposed-edit bubble (Cesare propose) dark fallback

- **Pagina:** screenplay editor durante un propose Cesare.
- **CSS:** `apps/web/app/features/screenplay-editor/lib/plugins/proposed-edit-decoration.module.css`. La bubble usa `var(--ds-surface-raised, var(--color-surface, #fafafa))`. `--ds-surface-raised` **NON esiste nel design system** (il token corretto è `--ds-surface-alt`) → cade su `--color-surface` (#111) → fallisce a `#fafafa` solo se anche quello è undefined. Risultato: la bubble di accept/reject delle proposte di Cesare appare con sfondo nero.
- **Bonus:** lo stesso file usa `--ds-text-muted` (nome errato — corretto: `--ds-text-mute`) e `--ds-border` (corretto: `--ds-line`).
- **Fix:** sostituire i nomi sbagliati con i token reali. Aggiungere anche `--shadow-sm` → `--ds-shadow-1`, `--radius-md` → `--ds-radius-md`.

---

### S2 — fix subito (intrusioni dark più piccole o contrasti dubbi)

#### 6. "Aggiungi al budget" button nero in SceneCostPanel

- **Pagina:** `/projects/:id/breakdown` — pannello costo scena a destra.
- **CSS:** `apps/web/app/features/breakdown/components/SceneCostPanel.module.css` riga 180-189 `.addBtn { background: var(--ds-text); color: var(--ds-surface); border-color: var(--ds-text); }`. `--ds-text` = `#1c1a17`, quindi pulsante quasi nero in mezzo a card light.
- **Fix:** se è la CTA primaria del pannello → `var(--ds-action)` con `color: var(--ds-text-on-dark)`. Se è secondaria → invertire (`background: var(--ds-surface-alt)`, `color: var(--ds-text)`, `border-color: var(--ds-line)`).
- **Screenshot:** `audit-5d-addbtn-zoom.png`.

#### 7. Dashboard view toggle "Griglia/Lista" active state nero

- **Pagina:** `/dashboard`
- **CSS:** `apps/web/app/features/projects/components/dashboard/DashboardFilters.module.css` righe 54-57 `.viewBtnActive { background: var(--ds-text); color: var(--ds-text-on-dark); }`. Stesso pattern del #6.
- **Fix:** preferire `background: var(--ds-action-soft); color: var(--ds-action);` (clay-50 + clay-500) per coerenza con il resto del DS, oppure `background: var(--ds-surface-deep); color: var(--ds-text);`.
- **Screenshot:** `audit-1-dashboard.png` (chip "GRIGLIA").

#### 8. Brand mark "O" header — accettabile ma rivedere

- **Pagina:** ovunque (TopBar)
- **CSS:** `_brandMark` (top left). Background `rgb(28,26,23)` (`--ds-text`), letter span è chiaro (rgb(245,243,238), `--ds-text-on-dark`) — quindi visivamente OK. Resta una macchia molto scura in un tema warm/light.
- **Decisione:** se è un asset di brand voluto (logo "scolpito"), tenere così e marcare come deliberate. Altrimenti spostare a `--ds-action` (clay) o `--ds-agent` (leaf) per restare nella bichromy del DS.

#### 9. Budget tetto + Settimane: collateral text issues

Conseguenza di S1#1 e S1#2: quando il bg torna light, anche `--color-text`, `--color-text-muted`, `--text-xs/sm/md/2xl`, `--font-weight-semibold/bold`, `--space-*`, `--shadow-sm`, `--radius-md/sm` vanno migrati ai token DS. Sono nello stesso file, fix in cascata.

---

### S3 — polish (cleanup, ridondanze, contrasti minori)

#### 10. `Sidebar.module.css` orphan con 20+ riferimenti legacy

- **File:** `apps/web/app/features/app-shell/components/Sidebar.module.css`
- **Stato:** il componente non è renderizzato (TopBar ha sostituito la sidebar). I `--color-*` non producono regressioni visibili oggi, ma il file è un trap.
- **Fix:** eliminare `Sidebar.tsx` + `.module.css` se davvero deprecato, oppure migrare ai `--ds-*`.

#### 11. `UserSettingsPage.module.css` — pagina rotta + token legacy

- **Pagina:** `/settings` (oggi mostra errore "Cannot read properties of undefined (reading 'name')", quindi non visibile, ma quando torna online apparirà dark).
- **Fix:** migrare a `--ds-*` quando si ripara la pagina.
- **Screenshot:** `audit-10-settings.png` (errore visibile).

#### 12. Project card "OWNER" badge poster + "Lungo · Thriller" caption

- **Pagina:** `/dashboard`
- I poster placeholder (olive / navy) sono **intenzionali** (`project.coverGradient`) — non da fixare. Ma il chip "OWNER" in alto a destra del card ha contrasto basso (testo grigio su white #ffffff piccolo). Verificare contrasto WCAG.

#### 13. Cesare button (footer dock) `color rgb(90,107,60)` su `bg rgb(229,233,216)`

- **Pagina:** dock in basso destra in molte pagine.
- Calcolo contrasto leaf-500 su leaf-50 ≈ 4.4:1 — borderline AA per testo piccolo. Considerare scurire il testo a `--ds-linen-800` quando il chip è inattivo, lasciando il pallino verde come affordance.

#### 14. `--color-accent-green/-red` referenziati in BlockingPin senza essere definiti

- **File:** `BlockingPin.tsx` riga 48, 58, 123, 133, 150, 171.
- I token non esistono né in `tokens.css` né in `linen.css`. Browser tratta `var(--color-accent-green)` come `unset` → cade su default SVG `fill="black"`. Quindi tutti i pin attore appaiono neri.
- **Fix:** mappare a `--ds-success` / `--ds-danger` (o ai token categoria `--ds-cat-cast` ecc.).

---

## Pagine viste OK (no dark intrusions o fix banali)

- `/projects/:id` (Overview) — tutto light, solo CTA dark coral (`--ds-action`) corretto.
- `/projects/:id/soggetto` — testo lungo su card cream, Cesare bottom sheet light, skeleton corretti.
- `/projects/:id/screenplay` (editor) — viewbar e topbar hanno bg `rgb(245, 243, 238)` (linen-50 ok). Eccezioni live: `proposed-edit-decoration` (S1#5) e `fountain-element-picker` (S1#4) quando attivati.
- `/projects/:id/schedule` — strip board light, chip suggestions leaf-soft.
- `/projects/:id/shooting-plan` (empty state) — light. Si rompe solo quando carica BlockingCanvas (S1#3).
- `/projects/:id/locations` — mappa OSM + lista light. No dark intrusions.
- Cesare panel (drawer e bottom sheet) — light cream con accenti leaf. Skeleton ok.

---

## Sommario per severità

- **S1:** 5 (BudgetCapBar dark, BudgetWeeklyView dark, BlockingCanvas dark, fountain-element-picker hardcoded dark, proposed-edit bubble dark)
- **S2:** 4 (Breakdown addBtn nero, Dashboard view toggle nero, BrandMark dark-on-light scelta brand, collateral text issues su file S1)
- **S3:** 5 (Sidebar orphan, UserSettingsPage, owner badge contrasto, Cesare chip contrasto borderline, BlockingPin token non definiti)
