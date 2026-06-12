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

- **[Real-project trial] 2026-06-11 — Valerio uses the tool on a real project, locally.**
  Protocol: `pnpm dev:session` (auto pre/post DB snapshot) · `MOCK_AI=false` · bugs go
  in `docs/BUGS.md` with screenshots, NO fixing mid-session · post-session triage puts
  the findings at the top of NEXT. The stabilization sprint continues after — **no new
  features** until the existing surface is solid.

### Filed 2026-06-11 (real-use session #2 — Valerio + collega, progetto reale) — TOP PRIORITY

-A. **[BUG-N67] Cesare scrive il TRATTAMENTO quando gli chiedi la SCENEGGIATURA** — entity routing dei tool universali, bug con AI reale, fix + real-AI smoke obbligatorio. `docs/BUGS.md`.
-B. **[BUG-N66] Versioning Cesare: una versione per OGNI tentativo** — policy owner: default sovrascrive la corrente, nuova versione solo su richiesta esplicita (o Cesare chiede). Vale per tutte le parti narrative. Serve spec (tocca auto-version invariant). `docs/BUGS.md`.
-C. **[BUG-N63] Export PDF sceneggiatura: dialoghi persi + frontespizio incompleto + bold scene heading** — fedeltà export, tre superfici in un fronte. `docs/BUGS.md`.
-D. **[BUG-N64] `?versions=…&peek=cesare` spacca la pagina** — contesa fra surface routate, deve fallire chiuso. `docs/BUGS.md`.
-E. **[BUG-N65] Composer Cesare rigido** — textarea auto-grow nel drawer e nella session page. `docs/BUGS.md`.
-F. **[BUG-N68] Breakdown "Per scena" spaginato + spoglio algoritmico** — audit codice breakdown, fix scoping/layout, spec per spoglio corretto SENZA AI (deterministico). `docs/BUGS.md`.

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

### Filed 2026-06-09 (real-use session — import/editor + versions/focus)

20. **[BUG-N44] Screenplay footer scene counter off-by-one after import** — _fixed (PR #34): leading `FADE IN:` no longer creates a phantom scene._ Kept for reference.
21. **[BUG-N45] Narrative autosave fires on every click / cursor move** — _resolved 2026-06-10 with BUG-N55: `onChange` was already gated on `tr.docChanged` (no save fires on caret moves — verified live); the visible symptom was the soggetto pill flapping from the non-sticky publisher gate, fixed by the sticky `soggettoEdited` flag. E2E [OHW-N55] asserts caret moves never publish the pill._
22. **[BUG-N46] "Salva come nuova versione" import path** — _resolved by Spec 71 (2026-06-09)._ The new-version import path was wrong end-to-end: it called `createManualVersion` (checkpoint of the OLD content) + `setContent`, so the import overwrote the _original_ active version and the new version held the old draft (and could land empty via an autosave clobber). Rebuilt as `importAsActiveVersion` — inserts a NEW version with the imported content, makes it ACTIVE, server-seeds its CRDT snapshot so the editor doesn't reseed empty. Verified live: import → new active "Versione 2" with content, old "v13" preserved & restorable, no clobber. `docs/specs/71-import-as-active-version.md`.
23. **[N-47 / Spec 68] Narrative coherence warnings** — cross-document consistency checks (identity/premise/title/beat/setting drift) surfaced as a non-blocking warning on every narrative part. AI-backed → Cesare tracer invariant + cost smoke + feature flag. `docs/specs/68-narrative-coherence-warnings.md`. Pulled from: imported screenplay incoherent with Soggetto, no warning.
24. **[N-48 / Spec 69] Screenplay keyboard-shortcut discoverability** — the element shortcuts already exist (`Mod-1..6` / `Alt-S/A/C/D/P/T`, Tab/Enter, `Mod-Shift-F`); make them discoverable (toolbar hints + `?` cheatsheet, single shared shortcut map) + audit gaps. `docs/specs/69-screenplay-keyboard-shortcuts.md`.
25. ~~**[N-49] Move the sidebar "+" into the gear/account menu**~~ — ✅ done 2026-06-10: "+ Nuovo progetto" lives in the project-header dropdown (with Apri/Impostazioni/Cambia); the orphan rail "+" toolbar is retired. E2E `tests/settings/settings-pages.spec.ts` N-49.
26. **[BUG-N51 follow-up] PDF wrap-joining** — reconstruct wrapped action/dialogue paragraphs into one logical line on top of the now-correct classification (deferred from the reverted unwrap attempt). Export should not emit more lines than the original.
27. **[N-52] Focus mode must keep the top bar (element legend + Indice + Focus + Salvato)** — focus mode renders a `position:fixed; inset:0` overlay (`ScreenplayEditor.module.css .focusMode`) with only a bare "Esci da Focus" toolbar; the shell Viewbar sits underneath and is hidden. The writer wants that bar visible in focus mode. Non-trivial: the element tabs live in the shell (`viewbarCenter`), not in `ScreenplayEditor` which owns the focus overlay. Measure + screenshot before/after.
28. **[N-59] Sidebar polish — make the rail "bella e coerente" Notion-style** (owner ask 2026-06-07, screenshot). Carried over from the Spec 66 follow-up batch; with the rail "+" gone (N-49) re-audit spacing/sections live before styling. **Includes the rail FOOTER (decided 2026-06-10, pairs with BUG-067):** the footer is ambient/system space, never primary actions (and never account/bell/gear — Spec 55). Move the realtime presence/sync status there as a discreet dot + label ("Sincronizzato · 2 online" / "Offline"), replacing the flapping label at the top of the document — this is the UX half of BUG-067 (the connect-flap root cause is the other half). Later, the `?` shortcuts-cheatsheet trigger (N-48) joins it. Nothing else; if the sync status isn't ready yet the footer stays EMPTY (a single orphan item would repeat the rail-"+" mistake N-49 just fixed).
29. **[N-60] Move the screenplay "Focus" control next to the version name** (like the treatment) to reclaim Viewbar space (owner ask 2026-06-07). Related to but distinct from N-52.
30. **[N-62] CI `e2e-chromium` has NEVER been green on the GitHub runner** (local: green). 2026-06-11 run: 380 pass / 14 hard / 26 flaky in 53m. Failure classes are runner-specific: 1.5m timeouts (teams ×3, pdf-import OHW-091/092, shooting-plan), keyboard-shortcut tests (⌘+Number ×4, Alt+C — suspect Meta-vs-Control on Linux), screenplay-authoring S03–S06, locations OHW-379. Needs its own front: reproduce on a Linux container or instrument the runner; until then the job is advisory — the push gate (`ci:repro`) mirrors only the mock-ui job, which IS green as of `a236a7c5`.

## ICEBOX (not now)

- ~~**[N-28] Spec 55 rollout to production pages**~~ — **DONE 2026-06-06 (Spec 67).** budget/breakdown/schedule/locations now publish the standard `⋯` menu with their exports; versions intentionally NOT surfaced on production pages (work on the active version). Legacy floating VersionsDrawer + compare modal retired. Branch `feat/spec-67-context-menus`.
- The deferred "Ma an…" shell example (user dropped it).
- Timeline Scaletta verticale (spec 15) · Moodboard/Storyboard (spec 19) · Billing & multi-tenancy (16-core) · AI auto-gen from screenplay (14/14b).
- BYOK encrypted user key + model choice (noted in spec 48).

## DONE (recent — trim periodically)

- **[Stabilization batch 2026-06-10] versions/import/realtime/save — merged to `main`**
  (`feat/versions-delete-and-current`, ~28 commits): per-version Yjs rooms + delete/blank
  - current-version chip; import-as-active-version (Spec 71); seed-time CRDT snapshots
    (Spec 72); coord-path PDF import (Spec 70: X-bucket classification, flush-left, cue
    recovery N51, transitions); BUG-N54 4-layer realtime clobber fix + screenplay
    fragment-merge seeding; BUG-N55 (pill vanish → sticky `useHasEdited`); BUG-N56
    (own-save guard `useVersionResync`); BUG-N45 closed; OHW-140/OHW-083 caught+fixed at
    the gate; N-49 (rail "+" → project menu). Absorbs the Spec 66 follow-up batch of
    2026-06-07 (switch/Nuova versione editor resync via `key={currentVersionId}`,
    `createBlankVersion`, delete-version modal, chip-aligned tests). Gates: unit 1847+30;
    full chromium at parity with main minus 7 pre-existing stale tests (need Valerio's go
    to realign — OHW-093, audit-export, spec55-backbone ×3, versions-splitdrawer ×2).
    New: `pnpm db:backup` + `pnpm dev:session`; E2E webServer hardened vs dev ws-server.
    Open follow-ups: **BUG-N57** (ws flap remount loop), **BUG-N58** (observation).
- [Spec 66] Versions master→detail unificato + `[● Versioni]` chip in TopBar + per-page
  action cluster — merged via the stabilization batch above. Assorbe N-34/N-35/N-36.

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
