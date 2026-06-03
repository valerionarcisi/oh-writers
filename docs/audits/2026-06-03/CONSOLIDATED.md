# Audit AI reale — 2026-06-03 — lista bug consolidata

Fleet di 5 auditor (i18n, Cesare reale, realtime, full-coverage, a11y) sul prodotto vivo
dopo il batch da sabato (i18n PR0–9, realtime Yjs Phase 2, react-aria, Effect engine).
Lead gate applicato: ogni finding ALTO è stata verificata live o in sorgente; le severità
sotto sono **rettificate dal Lead**, non quelle grezze degli auditor.

Reports per-auditor: `i18n-market-gating.md`, `cesare-ai-real.md`, `realtime-collab.md`,
`full-feature-coverage.md`, `a11y-react-aria.md`. Screenshot in `shots/<aN>/` + `shots/lead-gate/`.

Login: valerio@ohwriters.dev / valerio123 · viewer collab@ohwriters.dev / collab123.

---

## Pattern sistemico — stacking / pointer-events (root-cause condivisa)

Tre finding indipendenti sullo stesso tema: un elemento sovrasta un target interattivo e
ne intercetta i click. **Da indagare e fixare come un'unica famiglia**, non singolarmente.

- **C-01** (A4 F-02) — il submit "Genera PDF" SIAE non scarica: `<main>` intercetta il click (l'export funziona solo via `form.submit()`).
- **C-02** (A2 LANDING-01/02) — su `/sessions/new` il drawer Cesare resta `expanded` mentre la pagina entra in focus-mode; il div `cesare-conversation` copre il bottone "invia" (provato con `elementFromPoint`). `NewSessionLandingPage` deve forzare `data-cesare="closed"` quando entra in focus-mode.
- Correlato: **A-01** sotto (menu off-screen) — verificato dal Lead come bug di _posizionamento_, non di stacking; tenuto separato.

---

## ALTO

| #        | Bug                                                                                                                                        | Prova                                                                                                                              | Fix                                                                                                                                                                                                                                       | Fonte            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **A-01** | Menu ⋯ "Azioni sceneggiatura" irraggiungibile: si apre **fuori dal viewport** (y≈−91px), voci export/import non cliccabili da utente reale | Lead live: `elementFromPoint`=null, persiste dopo resize, nessun ancestor `transform`. `shots/lead-gate/a4-f01-menu-offscreen.png` | **Root-cause rettificata**: non è z-index del `<main>` (come da report A4) ma la logica flip-up in `DropdownMenu.tsx:158-181` che apre verso l'alto / non corregge le coord. Sistemare il calcolo placement + verificare in browser reale | A4 F-01          |
| **C-01** | Submit SIAE non scarica (click intercettato)                                                                                               | A4: ok solo via `form.dispatchEvent(submit)`                                                                                       | vedi _Pattern sistemico_                                                                                                                                                                                                                  | A4 F-02          |
| **C-02** | Bottone "invia" new-session coperto dall'overlay Cesare                                                                                    | A2: `elementFromPoint` = `cesare-conversation`                                                                                     | `NewSessionLandingPage` forza `data-cesare="closed"` in focus-mode                                                                                                                                                                        | A2 LANDING-01/02 |
| **A-02** | Team project (…013) mostra CTA "Continua sceneggiatura" → dead-end "Sceneggiatura non trovata"                                             | Lead verificato: il seed crea la screenplay per `TEST_TEAM_PROJECT`, non `VALERIO_TEAM_PROJECT`                                    | Guard nel `ProjectHero`: nascondere il CTA quando `screenplay === null` (+ opz. seed screenplay per …013)                                                                                                                                 | A3 F-01          |
| **A-03** | Viewer non riceve mai le modifiche live su Soggetto/narrativa                                                                              | Lead verificato `FreeNarrativeEditor.tsx:66` (`canEdit && !!documentId`); diverge dallo ScreenplayEditor che connette tutti        | Connettere la room Yjs per tutti (`!!documentId`); gate solo la scrittura su `canEdit` (il ws-server già blocca le write del viewer)                                                                                                      | A3 F-02          |
| **A-04** | Voce nav "Opportunità" assente nel rail IT (feature invisibile benché la route esista)                                                     | A1 source: `nav.ts` `PROD_ENTRIES` senza entry; runtime 0 link                                                                     | Aggiungere entry gated da `useFeature(Features.FUNDRAISING)`                                                                                                                                                                              | A1 F1            |
| **A-05** | ~50 `Intl.*("it-IT")` hardcoded: date/numeri sempre in italiano per utenti EN                                                              | A1: EN dashboard mostra "3 GIU". Lista file nel report A1                                                                          | Usare `useLocale()` + `formatDate/formatNumber(…, locale)` da `packages/domain/src/i18n/format.ts`                                                                                                                                        | A1 F3            |
| **A-06** | Stringhe IT hardcoded in `packages/ui` (CesareDrawer, LeftRail) — l'utente EN vede italiano nella chat e nel rail                          | A1: `CesareDrawer.tsx:555/557/628`, `LeftRail.tsx:356/358`                                                                         | Threadare label props tradotte dai chiamanti in `features/predictions` + `features/app-shell`                                                                                                                                             | A1 F4            |
| **A-07** | a11y: `<button>` annidato in `<button>` nel PeekRow di Cesare (HTML non valido, WCAG 4.1.1)                                                | A5: `CesareDrawer.tsx:243-267` (Lead verificato)                                                                                   | `<div role="group">` + due button fratelli                                                                                                                                                                                                | A5 F1            |
| **A-08** | a11y: trigger `DropdownMenu` senza focus ring (`all:unset`, nessun `:focus-visible`; WCAG 2.4.7) — riguarda tutti i menu ⋯                 | A5: `DropdownMenu.module.css:1-5` (Lead verificato: il `:focus-visible` a riga 48 è su `.menuItem`)                                | `.triggerWrap:focus-visible { outline: 2px solid var(--ds-action) }`                                                                                                                                                                      | A5 F2            |
| **A-09** | a11y: `CommandPalette` senza `role=combobox`/`aria-expanded`, keyboard nav fatta a mano (WCAG 4.1.2 + viola regola react-aria)             | A5: `CommandPalette.tsx:146-207`                                                                                                   | Minimo: aggiungere `role`+`aria-expanded`. Completo: migrare a `useComboBox`                                                                                                                                                              | A5 F3            |

## MEDIO

| #        | Bug                                                                                                             | Note                                                                                                | Fonte          |
| -------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| M-01     | SSR emette `projects/undefined/<route>` (declassato da ALTO: app dietro auth, il client idrata)                 | loader sul layout `$id_`                                                                            | A4 F-03        |
| M-02     | Modal SIAE montata in EN (declassato da ALTO: trigger gated → non apribile; resta DOM/a11y)                     | `{siaeEnabled && <ExportSiaeModal/>}`                                                               | A1 F2          |
| M-03     | Versions SplitDrawer con body vuoto (blocca il revert) — **da riverificare** (può legarsi a soggetto vuoto/404) |                                                                                                     | A2 VERSIONS-01 |
| M-04     | Presenza nell'overview mai mostrata (legato ad A-02)                                                            | room presence solo se screenplay≠null                                                               | A3 F-03        |
| M-05     | Titoli pagina (`head()`) tutti IT hardcoded                                                                     | locale-aware via root loader                                                                        | A1 F5          |
| M-06     | `DEFAULT_PRIMARY_SESSION_TITLE = "Sessione principale"` sempre IT                                               | chiave i18n                                                                                         | A1 F6          |
| M-07     | a11y: focus-visible mancante su 4 button del CesareDrawer                                                       | A5 F4                                                                                               | A5 F4          |
| M-08     | a11y: TopBar search + FloatingDock usano `<button>` senza `useButton`                                           | A5 F5                                                                                               | A5 F5          |
| M-09     | a11y: `DropdownMenu` senza `DismissButton` (Tab-out non chiude)                                                 | A5 F6                                                                                               | A5 F6          |
| M-10     | `/teams` → 404 (no index route)                                                                                 | redirect/index                                                                                      | A4 F-06        |
| M-11     | Export PDF sceneggiatura: dialog "Genera" ridondante                                                            | A4 F-04                                                                                             | A4 F-04        |
| **M-12** | **Rail doppio footer** — due bande (account + tools) entrambe con `border-block-start`                          | ✅ **FIXED** questa sessione (branch `fix/rail-single-footer`): tools spostata in alto stile Notion | Lead/utente    |

## BASSO

| #    | Bug                                                                                                                                                    | Fonte     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| B-01 | Locations senza UI Places/atmosphere — **probabile config** (`GOOGLE_PLACES_API_KEY` assente in dev), da confermare                                    | A4 F-05   |
| B-02 | Cast tier tutti "—" nel seed                                                                                                                           | A4 F-07   |
| B-03 | `/logline` → 404 (logline vive dentro Soggetto)                                                                                                        | A4 F-08   |
| B-04 | "+ Nuova versione" screenplay senza feedback — **da riverificare**                                                                                     | A4 F-09   |
| B-05 | Doppio slug nel filename Fountain export (`non-fa-ridere-non-fa-ridere-…`)                                                                             | A4 obs    |
| B-06 | Schedule PDF footer in IT per utenti EN                                                                                                                | A1 F8     |
| B-07 | a11y minori: `Tabs` aria-label "Tabs", `SegmentedControl` senza label di default, `.toast` FloatingDock senza reduced-motion, `triggerLabel` opzionale | A5 F7-F10 |

---

## Coperture e limiti

- **Non esercitato**: Redis multi-istanza (1 sola istanza ws), role-change Teams (serve 2° utente accettato), import file reali PDF/Fountain, diff screenplay, agentic-edit con write-tool confermato (A2 ha usato 3/6 richieste, l'AI ha risposto conversazionalmente senza invocare il tool di scrittura).
- **Key safety Cesare**: PASS — nessuna chiamata browser a `api.anthropic.com`, key mai loggata.
- **Tracer invariant**: non confermato live (trace troppo transiente per il polling); pipeline ok in sorgente. Da riprovare con prompt che forzi un edit.

## Falsi positivi corretti dal Lead

- A4 F-01: root-cause "z-index `<main>`" → in realtà **posizionamento menu** (flip-up off-screen).
- A1 F2: ALTO → **MEDIO** (trigger gated, modal non apribile in EN).
- A4 F-03: ALTO → **MEDIO** (solo SSR, il client idrata).
