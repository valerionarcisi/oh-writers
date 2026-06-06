# Backlog — the single live work queue

State lives here, not in the chat. This is the ONE place that says what's open and
what's next. Detail lives in the linked spec / audit / learning — keep entries to a line.

## Protocol

- **WIP = 1.** One front in NOW at a time, taken to merge before pulling the next.
  Agents spawned for isolated sub-tasks don't count against the limit.
- **Per-item lifecycle:** pick from NOW → branch → implement + validate (measure +
  screenshot + E2E test, per `docs/conventions/ui-ux-research.md`) → merge → move to
  DONE + log a learning if warranted → `/clear` → next.
- **Context hygiene:** after each merged item, `/clear` (or a fresh session). The next
  session reads this file + the one relevant spec. The files are the memory.
- **No workaround when the proper path is feasible** — flag explicitly if one is taken.

Item format: `[id] short title — link (spec NN / audit A-0x / learning)`

---

## NOW (max 1)

- _(empty — pull the top NEXT item)_

  **Narrative Walk fleet — DONE (2026-06-05).** All lanes merged to `main`:
  A1 (`82202c6`), A2 (`98a513a`), A3/N-27 (`08ef8bc`), A4 sessions, A6 (`dd35ff2`),
  N-20 i18n (`dad1c1e`), and **A5 screenplay chrome (`31c0c87` — N-18 borderless page +
  N-19 TopBar action menu, Spec 55a)**. Follow-ups filed during the A5 gate:
  **N-31** (editor/screenplay-editor E2E suites not in CI + rotted locators/assertions +
  DB-truncation races) and **N-32** (touch focus-enter affordance + localise "Exit Focus").
  Also merged this session outside the fleet: **N-30 / Spec 60** route error boundary
  (`dfe58f3`).

- **[Spec 66] Versions master→detail (unificato) + per-feature action menu** —
  **BUILT 2026-06-06** on `feat/spec-66-versions-master-detail` (8 fasi, commit
  `797b18b`..`b1b5163e`). Master→detail (lista → versione read-only + Attiva/Indietro),
  NIENTE diff; narrative+screenplay unificati nella stessa surface (Attiva=restore per
  screenplay, `?vkind=`); `[● Versioni]` chip in TopBar; cluster azioni-pagina
  Notion-style vicino all'account zone; migration 0037; OHW-066 E2E (5/5) +
  splitdrawer (5/5) + unit 1763. **Bug di prodotto trovato+fixato dagli E2E**: badge
  "Attuale" non si spostava dopo Attiva (leggeva l'URL hint statico) → ora legge il
  current live. Assorbe N-34/N-35/N-36. **Resta**: gate Design/QA/Lead + merge.
  Follow-up: logline export menu, liste lunghe (67+ versioni), rimozione file rotta
  screenplay legacy. Verificato live sul progetto reale (Chrome).

## NEXT (prioritised — narrative walk topics, then the rest)

-0. **[N-38 / Spec 63] Entity change feedback — banner + adaptive block highlight** — replace the dead `DraftBanner` with a persistent banner "✦ Cesare ha aggiornato il \<Entity> · [Vedi cosa è cambiato] · [↩ Annulla]". ADAPTIVE in-text feedback: surgical edit (<~40% words) → highlight changed BLOCKS in place (clears per-block when the author edits that block / "Ho visto" / Cmd-Z); large rewrite (>=~40%) → no highlight, only the split bullets. "↩ Annulla" reverts the whole edit via the pre-edit snapshot; NO accept (already applied). Never a timeout. All narrative docs via shared editor. `docs/specs/63-entity-change-feedback-banner.md` + `docs/adr/0003` (+ ADR-0001 reconciliation). _Deferred 2026-06-05 — the inline word-diff removal shipped; this banner+adaptive-highlight is the remaining half._

-0.1 **[N-39] Cesare edit applies as a native editor transaction (Spec 62 #2)** — the still-open core: apply the edit as ONE ProseMirror transaction in the open editor (Cmd-Z undo, no flash-revert) instead of the DB→query→prop resync. `docs/specs/62-cesare-edit-as-transaction.md` + `docs/adr/0001`.

-1. **[N-33] End-of-elaboration notifications** — _fixed 2026-06-05 (owner testing): emitted in `handleCesareAssistantResponse` (runs on every completed turn, streaming-primary) when tools ran; the legacy start/complete pair lived only on the dead non-streaming path._
-2. **[Spec 61] Cesare soggetto flash-then-revert** — _in review (owner testing on dev)._ Canonical autosave dirty-check so a Cesare apply (plain text) isn't clobbered by the editor's HTML re-serialisation. `docs/specs/61-narrative-autosave-canonical-dirty.md`. ⚠️ Fix covers the editor-has-NEW case only; if the editor stays on OLD (resync miss) the resync path still needs work — pending owner repro on WS-offline dev.
-3. **[N-37] Cesare ↗ routes to session detail + split ◫ marker removed** — _in review (owner testing)._ Floating ↗ navigates to `/sessions/:id` (no more "full" overlay); split header drops the no-op ◫ marker. E2E `tests/cesare-floating-arrow-routes.spec.ts`.

0. ~~**[Spec 59] App recap HTML**~~ — ✅ done (`docs/recap/2026-06-05-app-recap.html`, 13-slide showcase tour + 8-strip Narrative-Walk changelog, dual voice; live captures on the dev stack with the finished A5 chrome). See DONE.
1. **[Topic 1 / Spec 55] TopBar standard** — exports + versions + notifications + save, all "near the lens"; per-page tool pattern; drawers always SplitDrawer; kill old drawers. `docs/specs/55-shell-action-standard.md` + BUGS N-01..N-04. **Backbone — unblocks Topics 5, parts of others.** Concrete asks filed this session:
   - ~~**[N-34]** Versions in Soggetto via SplitDrawer~~ — **moved into Spec 66 (NOW)**. NB: 66 decided master→detail, NOT a VS Code-style diff (ADR-0004 supersedes the diff ask).
   - ~~**[N-35]** "Mostra/Vedi modifiche" opens Versions SplitDrawer~~ — **moved into Spec 66 (NOW)**. The Versions surface 66 opens is master→detail, no diff.
   - ~~**[N-36]** Per-feature export/import popover~~ — **moved into Spec 66 (NOW)** as the Notion-style top-right per-feature action menu on all narrative routes.
2. ~~**[Topic 4] Logline + nav** (N-16, N-17)~~ — ✅ done, Spec 57.
3. **[Topic 2] Cesare drawer & chat UX** — starts closed, split-view input missing, Claude-style fixed chat, bubbles, show/hide, markdown, suggestions (N-05..N-11).
4. **[Topic 3] Cesare sessions** — list/landing/conversation UI + session model question (N-12..N-15).
5. **[Topic 5] Narrative editor chrome** — screenplay bare page (N-18); element-tabs/imports/functionality (N-19).
6. **[Topic 6] i18n leaks** — EN/IT mix (N-20) — audit A-05/A-06.
7. **[Topic 7] Shell & settings polish** — brand label, avatar≠gear, account-settings width, project icon (N-21..N-24).
8. **[Topic 8 / ICEBOX→spec] Live-draft via Cesare** — N-25 (own spec).
9. _(then the remaining audit items not covered above — A-01 menu off-screen, A-03 viewer realtime, A-07/08/09 a11y; Spec 56 phases 1b/2/3/4.)_
10. **[A-01] Screenplay ⋯ menu opens off-screen** — `DropdownMenu` flip-up — audit A-01.
11. **[C-01/C-02] pointer-events family** — SIAE submit + new-session send intercepted (shared stacking root cause) — audit C-01/C-02.
12. **[A-03] Viewer never gets live narrative/Soggetto edits** — `FreeNarrativeEditor.tsx:66` — audit A-03.
13. **[A-04] "Opportunità" nav entry missing in rail** — audit A-04.
14. **[A-05] ~50 hardcoded `it-IT` Intl formatters** — dates/numbers wrong in EN — audit A-05.
15. **[A-06] Hardcoded IT strings in `packages/ui`** (Cesare drawer, rail) — audit A-06.
16. **[A-07/08/09] a11y** — nested button (PeekRow), DropdownMenu trigger focus ring, CommandPalette combobox — audit A-07/08/09.
17. **[56-1b] a11y axe automation** — needs approval to add `@axe-core/playwright` — `docs/specs/56-continuous-qa-system.md` Phase 1b.
18. **[56-2] DS Phase 2 remainder** — single-home action check + shell-zone structural assertions (needs Spec 55) — spec 56 Phase 2.
19. **[56-3/4] Visual regression + DoD gate + heuristic loop + Stop-hook wiring** — spec 56 Phase 3/4.

## ICEBOX (not now)

- **[N-28] Spec 55 rollout to production pages** (budget/breakdown/schedule/locations) — TopBar action-registry backbone lands app-wide via the fleet's A1, but per-page export/versions registration for production pages is deferred. Valerio to analyse those zones and file specific bugs. Spec 56 CI may flag those routes as non-compliant until then (expected). See `docs/BUGS.md` Topic 9.
- The deferred "Ma an…" shell example (user dropped it).
- Timeline Scaletta verticale (spec 15) · Moodboard/Storyboard (spec 19) · Billing & multi-tenancy (16-core) · AI auto-gen from screenplay (14/14b).
- BYOK encrypted user key + model choice (noted in spec 48).

## DONE (recent — trim periodically)

- [Spec 59] App recap HTML — `docs/recap/2026-06-05-app-recap.html` (self-contained, base64 screenshots): 13-slide showcase tour (login→dashboard→overview→narrativa→sceneggiatura→breakdown→budget→schedule→locations→Cesare→settings) + 8-strip Narrative-Walk changelog (technical voice, separated). On-brand palette/fonts. Generator: `docs/recap/build-recap.mjs`. Live captures on the dev stack (reseeded) at 1440px.
- [Spec 55a / A5 / N-18+N-19] Screenplay borderless page + TopBar action menu (`31c0c87`).
- [Spec 60 / N-30] App-wide route error boundary (`dfe58f3`).
- [Topic 4 / N-16+N-17] Collision-aware `Popover` primitive + correct "Soggetto" EN label — `docs/specs/57-popover-collision-and-soggetto-label.md`.
- [M-12] Rail single footer (tools → top, Notion-style) — superseded by Spec 55 TopBar later.
- Audit AI reale 2026-06-03 — 5 auditors + Lead gate — `docs/audits/2026-06-03/CONSOLIDATED.md`.
- [56-1] Route-coverage smoke + fixed dead routes /teams & /logline — wired into CI.
- [56-2a] DS-consistency guard (no inline gating + rogue-hex ratchet).
- [logline] E2E tests — manual edit + Cesare-assisted (mock).
- Specs 55 + 56, `docs/conventions/ui-ux-research.md`, `docs/LEARNINGS.md`.
