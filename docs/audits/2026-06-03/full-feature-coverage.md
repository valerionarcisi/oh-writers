# Full-Feature Coverage Audit — 2026-06-03

**Auditor:** A4 — Full-feature coverage (anti-blind-spot guard)  
**App URL:** http://localhost:3000 (existing dev server, shared seeded DB)  
**Login:** valerio@ohwriters.dev / valerio123  
**Screenshots:** `docs/audits/2026-06-03/shots/a4/` (56 screenshots, stored in shared repo path)

---

## Summary

| Severity | Count |
| -------- | ----- |
| ALTO     | 3     |
| MEDIO    | 4     |
| BASSO    | 3     |

---

## Findings

### F-01 — Dropdown menu items blocked by main content (pointer-events z-index bug)

**Severity:** ALTO — Export/import is a core user workflow. Affected menus are the primary way to access screenplay exports. Users on any device will hit this when attempting Fountain/PDF import or export via the ⋯ menu.

**Proof:** When clicking `Azioni sceneggiatura` (⋯) in the screenplay toolbar, menu items like "Esporta Fountain", "Importa Fountain", "Importa PDF" cannot be clicked via normal pointer interaction. Playwright logs:

```
<main id="main-content" class="_main_svrtr_75">…</main> intercepts pointer events
```

Workaround: `document.querySelector('[data-testid="menu-item-export-fountain"]').click()` works. File `non-fa-ridere-non-fa-ridere-2026-06-03.fountain` was downloaded via this bypass. Screenshot: `shots/a4/28-screenplay-toolbar-menu-intercept.png`

**Repro:** Screenplay editor → click ⋯ (Azioni sceneggiatura) → attempt to click "Esporta Fountain" → click is blocked (no action).

**Fix:** The `<main>` element creates a stacking context above the menu. In `apps/web/app/routes/_app.projects.$id_.editor.module.css` or `AppShell` layout CSS, the `_main_svrtr_75` class likely sets `position: relative` or `z-index` that outranks the menu portal. Solution: ensure DropdownMenu/Menu portals (rendered at `document.body`) have `z-index` defined in the design system tokens above the main content z-index, or remove any stacking context that elevates `<main>` above overlays.

---

### F-02 — SIAE export: "Genera PDF" button click silently fails

**Severity:** ALTO — The SIAE export is the primary regulatory compliance export (Spec 04f). The button appears active and enabled but does nothing when clicked. No error shown, dialog closes without a file.

**Proof:** After opening the SIAE export dialog (Soggetto → Altre azioni → Esporta SIAE → fill required fields), clicking "Genera PDF" (`[data-testid="siae-export-submit"]`) closes the dialog with no download. No error in console. Confirmed: `document.querySelector('[data-testid="siae-export-submit"]').disabled === false` (button enabled). Only `form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}))` triggered the actual export — `la-citt-silenziosa-soggetto-siae.pdf` downloaded. The Playwright click error during reproduction: `<main id="main-content">…</main> intercepts pointer events`.

**Repro:** Soggetto (La città silenziosa, has content) → Altre azioni → Esporta SIAE → form pre-filled (title, genre, date, author "Valerio") → click "Genera PDF" → dialog closes, no PDF.

Screenshots: `shots/a4/31-siae-dialog-state.png`, `shots/a4/32-siae-export-success.png`

**Fix:** Same root cause as F-01. The Modal component renders in the DOM but the submit button inside its footer is behind the `<main>` z-index. In `packages/ui/src/primitives/Modal.module.css` or the Modal/Dialog component: ensure `z-index` of the overlay backdrop and content container are set above `--z-main` or whatever stacking value `<main>` uses. Also check `DsButton` in the footer: if it renders inside a `<footer>` with `position: static`, it may inherit a lower z-index than the modal overlay.

---

### F-03 — SSR emits `/_app/projects/undefined/<route>` as route ID in hydration payload

**Severity:** ALTO — Every project sub-route that is loaded directly (not via SPA navigation) emits a malformed route ID in the SSR `__TSR_SSR__.initMatch` hydration payload. This means on first load, TanStack Router is matching the route with `id=undefined` during server render. The page appears to function after client hydration, but the SSR pass produces no meaningful `loaderData`, which means:

- Page content is not SSR-rendered (blank initial HTML, content appears on hydration)
- Server-side SEO/sharing tags would be missing project info
- Any SSR-run server fn that reads projectId from params would receive `undefined`

**Proof (repro steps):** Open any project sub-route directly:

```
http://localhost:3000/projects/00000000-0000-4000-a000-000000000012/breakdown
```

Browser console shows:

```json
{"id":"/_app/projects/undefined/breakdown","loaderData":"{\"$undefined\":0}","error":"{\"$undefined\":0}","extracted":null,"updatedAt":...,"status":"success"}
```

Observed on: breakdown, screenplay, soggetto, budget, schedule, shooting-plan, treatment, synopsis, outline. Same pattern on all `$id_` sub-routes.

**Fix:** In TanStack Start, the `$id_` pathless layout route pattern (`_app.projects.$id_.breakdown.tsx`) may not correctly forward the `$id` param to nested routes during SSR. Add a `loader` to the parent `_app.projects.$id_.tsx` (or a shared `_app.projects.$id_` layout route if one exists) that reads and validates the project ID, returning it for child routes to use. Example:

```ts
export const Route = createFileRoute("/_app/projects/$id_")({
  loader: ({ params }) => ({ projectId: params.id }),
});
```

Each sub-route can then call `Route.useRouteContext()` or parent loader data to get the validated ID during SSR.

---

### F-04 — Screenplay PDF export requires extra "Genera" confirm step (UX friction)

**Severity:** MEDIO — Not a crash. Clicking "Esporta PDF ▾" → "Standard" opens a confirmation dialog with a "Genera" button. The confirm dialog adds no meaningful configuration beyond what the menu selection already communicated.

**Proof:** Flow: Screenplay → "Esporta PDF ▾" (expanded) → click "Standard Copione completo" → dialog "Esporta — Standard" appears → click "Genera" → PDF downloaded. Other exports (budget CSV/PDF, schedule CSV/PDF, shot list) are: one button → optional format selector → Genera. The screenplay PDF dialog has no additional options beyond the menu item already selected. Screenshot: `shots/a4/26-screenplay-pdf-dialog.png`.

**Fix:** Remove the intermediate confirm dialog for screenplay PDF format options. On menu item click, trigger the download directly (with a brief loading state indicator). The `useExportScreenplayPdf` hook can be called from the menu item's `onPress` handler.

---

### F-05 — Locations: no scene-aware discovery (Places API) or atmosphere/scouting notes in candidate form

**Severity:** MEDIO — Spec 37b (scene-aware discovery) and 37c (atmosphere ranking) are marked DONE in STATUS.md. The Locations page shows synced locations but no UI for discovering candidate locations from Places API or entering scouting/atmosphere notes.

**Proof:** Locations page → Sincronizza da breakdown → 8 locations appear → click "Cucina" → detail panel shows "✦ Cesare" and "+ Aggiungi candidato" → candidate form shows two text inputs (name + address) and a map. No "Cerca nelle vicinanze" button, no atmosphere notes textarea, no scouting score. Screenshots: `shots/a4/23-location-detail.png`, `shots/a4/24-location-candidato.png`.

**Fix:** If Places API requires a key not set in dev (`.env.local`), this is a configuration issue — add `GOOGLE_PLACES_API_KEY` to dev setup docs. If the feature is behind a Cesare call ("✦ Cesare" button on the location), document the user flow. Otherwise, verify that `PlacesDiscovery` and `AtmosphereCard` components are wired into the location detail panel in `features/locations/`.

---

### F-06 — `/teams` route returns 404 (no team listing page)

**Severity:** MEDIO — STATUS.md confirms Teams UI is PARTIAL. But `/teams` gives a blank "Not Found" page with a console error. Any deep link or bookmark to `/teams` is broken.

**Proof:** Navigate to `http://localhost:3000/teams` → Page title "Oh Writers" (not "Teams"), console: `Failed to load resource: the server responded with a status of 404`. TanStack Router log: `notFoundError was encountered on the route with ID "__root__"`. Routes `/teams/new` and `/teams/<slug>` work. Screenshot: `shots/a4/34-teams-404.png`.

**Fix:** Add `apps/web/app/routes/_app.teams.tsx` (or `_app.teams.index.tsx`) with a redirect to `/teams/new` or a teams listing component. One line fix:

```ts
// _app.teams.index.tsx
export const Route = createFileRoute("/_app/teams/")({
  component: () => <Navigate to="/teams/new" />,
});
```

---

### F-07 — Cast tier shows "—" for all elements in seeded data

**Severity:** BASSO — Spec 10d (cast tier) is marked done. The Tier column is present in the breakdown "Per progetto" cast table, but all 11 seeded cast members show `—`. The feature is structurally present but not exercisable with seed data.

**Proof:** Breakdown → Per progetto → Cast table header: "Selezione Nome Tier Scene Range Origine Stato Costo stim." All rows (Filippo, Giulio, John, Luca, Michele, etc.) show `—` in Tier column.

**Fix:** Update the seed script (`docker/postgres-init/` or test fixtures) to assign cast tiers to at least 3 cast members (e.g., Filippo=principal, Giulio=supporting, Pubblico=extra) so the feature is exercisable in dev.

---

### F-08 — `/logline` route is 404; no dedicated logline URL

**Severity:** BASSO — The URL pattern `/projects/:id/logline` returns 404. The logline lives inside the Soggetto page. Routes for `/synopsis`, `/outline`, `/treatment` all exist as separate routes. The sidebar shows Soggetto as the entry point, but users referencing the spec or trying to deep-link to the logline editor from a session note will get a 404.

**Proof:** `http://localhost:3000/projects/00000000-0000-4000-a000-000000000012/logline` → 404, redirects to project overview. Console: `Failed to load resource: 404`.

**Fix:** Either create `_app.projects.$id_.logline.tsx` as a redirect to soggetto, or document that logline is embedded in the soggetto page. The sidebar navigation item could also be renamed to "Soggetto & Logline" to reduce confusion.

---

### F-09 — "+ Nuova versione" in Screenplay Versions drawer gives no feedback

**Severity:** BASSO — Clicking "+ Nuova versione" in the screenplay Versions SplitDrawer produced no visible state change, toast, or new version entry during this audit.

**Proof:** Screenplay → Versioni button → Apri Versioni → SplitDrawer opens (complementary sidebar, not `?peek=` route) with heading "Versioni screenplay" and "+ Nuova versione" button → click button → no loading indicator, no new version appears, no toast. Screenshots: `shots/a4/55-versions-drawer.png`, `shots/a4/56-versions-splitdrawer.png`.

**Fix:** Verify the `useCreateScreenplayVersion` mutation (in `features/versions/`) fires correctly and invalidates the versions list query on success. Add an `onSuccess` toast via the notification system. Also confirm the button is wired to a mutation (not just a stub). A quick check: `document.querySelector('[data-testid="versions-create-btn"]')?.onclick` should show a handler.

---

## Coverage Checklist

### ✅ Exercised

| Feature                                                                            | Result                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| Projects — create new                                                              | ✅                                                  |
| Projects — open settings                                                           | ✅                                                  |
| Projects — archive                                                                 | ✅                                                  |
| Projects — delete                                                                  | ✅                                                  |
| Projects — empty state (fresh project)                                             | ✅                                                  |
| Breakdown — Per scena view                                                         | ✅                                                  |
| Breakdown — Per progetto view                                                      | ✅                                                  |
| Breakdown — Matrice tab                                                            | ✅                                                  |
| Breakdown — auto-spoglio (Ri-spogliare con AI)                                     | ✅                                                  |
| Breakdown — element categories (Cast, Location, Veicoli, Suono, Oggetti, Comparse) | ✅                                                  |
| Breakdown — cast tier column visibility                                            | ✅                                                  |
| Breakdown — CSV export                                                             | ✅ `breakdown-valerio-non-fa-ridere-2026-06-03.csv` |
| Breakdown — PDF export                                                             | ✅ blob tab opened                                  |
| Budget — Panoramica view                                                           | ✅                                                  |
| Budget — Per categoria view                                                        | ✅                                                  |
| Budget — Per giornata view                                                         | ✅                                                  |
| Budget — Rate card (Tariffe section)                                               | ✅                                                  |
| Budget — Day cost drilldown                                                        | ✅                                                  |
| Budget — CSV export                                                                | ✅ `valerio-non-fa-ridere-budget-2026-06-03.csv`    |
| Budget — PDF export                                                                | ✅ blob tab opened                                  |
| Schedule — Spannografo (StripBoard)                                                | ✅                                                  |
| Schedule — Giornata view                                                           | ✅                                                  |
| Schedule — Settimane (calendar) view                                               | ✅                                                  |
| Schedule — Modifica data                                                           | ✅ inline date picker                               |
| Schedule — Unscheduled tray visible                                                | ✅                                                  |
| Schedule — CSV export                                                              | ✅ `valerio-non-fa-ridere-schedule-2026-06-03.csv`  |
| Schedule — PDF export (Stampa)                                                     | ✅ blob tab opened                                  |
| Shooting plan — shot list view                                                     | ✅                                                  |
| Shooting plan — CSV export                                                         | ✅ `valerio-non-fa-ridere-shot-list-2026-06-03.csv` |
| Shooting plan — PDF export                                                         | ✅ `valerio-non-fa-ridere-shot-list-2026-06-03.pdf` |
| Blocking editor — canvas + tools                                                   | ✅                                                  |
| Locations — sync from breakdown                                                    | ✅ 8 locations                                      |
| Locations — add candidate form                                                     | ✅ address + map                                    |
| Screenplay — editor                                                                | ✅                                                  |
| Screenplay — PDF export (Standard)                                                 | ✅ via Genera dialog                                |
| Screenplay — Fountain export                                                       | ✅ via JS click (F-01 workaround)                   |
| Screenplay — PDF import                                                            | ✅ file chooser triggered                           |
| Screenplay — Fountain import                                                       | ✅ file chooser triggered                           |
| Screenplay — Versions SplitDrawer                                                  | ✅                                                  |
| Soggetto — editor                                                                  | ✅                                                  |
| Soggetto — DOCX export                                                             | ✅ `non-fa-ridere-soggetto.docx`                    |
| Soggetto — SIAE export                                                             | ✅ via form submit dispatch (F-02 workaround)       |
| Teams — create new team                                                            | ✅                                                  |
| Teams — invite member                                                              | ✅ pending invite shown                             |
| User settings — profile                                                            | ✅                                                  |
| User settings — locale selector (IT/EN)                                            | ✅                                                  |
| Cesare — new session full-screen                                                   | ✅                                                  |
| Cesare — streaming response state                                                  | ✅                                                  |
| Narrative editors — synopsis, outline, treatment                                   | ✅                                                  |
| Title page                                                                         | ✅                                                  |
| Fundraising / Opportunities                                                        | ✅                                                  |
| Dashboard                                                                          | ✅                                                  |

### ⚠️ Partially Exercised

| Feature                                        | Gap                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Locations — Places API / scene-aware discovery | No discovery UI visible; may require Google API key in dev      |
| Locations — atmosphere/scouting notes          | Not visible in candidate form                                   |
| Blocking editor — drawing operations           | Tools visible; no canvas interaction tested                     |
| Cesare — complete streaming cycle              | MOCK_AI response initiated, completion not awaited              |
| Budget — Settimane view                        | View radio option exists; not clicked                           |
| Shooting plan — ShootingDayDrawer detail       | Modifica data clicked (date picker); full day drawer not opened |

### ❌ Not Exercised

| Feature                                             | Reason                                                |
| --------------------------------------------------- | ----------------------------------------------------- |
| Teams — role change                                 | Requires accepted invite (second user)                |
| Teams — settings page (`/teams/<slug>/settings`)    | Route exists but not navigated                        |
| Breakdown — read-only behavior (viewer role)        | Only owner credentials available                      |
| PDF import — actual file upload                     | File chooser triggered; no valid PDF uploaded         |
| Fountain import — actual file upload                | File chooser triggered; no valid .fountain uploaded   |
| Screenplay — version snapshot view (read-only)      | Versions drawer opened; no specific version clicked   |
| Screenplay — inline scene number edit               | Not exercised                                         |
| Screenplay diff view (`/screenplay/diff/$v1/$v2`)   | Route exists; not navigated                           |
| Cesare — agentic edit flow (document mutation)      | Session initiated; edit tool not triggered in MOCK_AI |
| Real-time collaboration (Yjs)                       | Requires two browser sessions                         |
| Narrative export — PDF (logline/synopsis/treatment) | Route exists (`ExportPdfModal`) but not exercised     |

---

## Notable Technical Observations

1. **`@tanstack/start` deprecation warning** — Three warnings on every page: `This package has moved to @tanstack/react-start`. Not user-facing but should be resolved before production.

2. **`loaderData: {"$undefined":0}`** — Standard TanStack Router SSR serialization when no `loader` is defined. Not a runtime bug but related to F-03.

3. **Seeded project "Non fa ridere"** has complete screenplay (9 scenes), breakdown (11 cast + elements), budget (3 days, €30K total), and schedule (3 days). "La città silenziosa" has only soggetto/logline, no screenplay.

4. **Double filename in Fountain export**: Downloaded file was `non-fa-ridere-non-fa-ridere-2026-06-03.fountain` — project slug repeated. Minor cosmetic bug in filename generation.
