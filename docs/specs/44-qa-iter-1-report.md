# Spec 44 — QA Acceptance · Iteration 1 Report

**Branch under test:** `refactor/ux-notion-v3-qa-iter-1` @ `20a7dc1` (origin/refactor/ux-notion-v3 head)
**Date:** 2026-05-29
**Conductor:** lead-qa-validator (Opus 4.8)
**Viewport constraint:** chrome-agent headless window fixed at 756×469 (no resize flag). Pure-width layout tests marked INCONCLUSIVE; behavioural tests valid at any size.
**User-supplied acceptance additions (Image 2–6):** see "User contract amendments" below — these reshape the gate.

## Summary

- **Jira:** TEST-878-2
- **Blockers: 1** · **Majors: 5** · Minors/cosmetic: deferred
- Convergence: **NOT reached** — spawn fix-agents, re-QA iter-2.
- Headline: Cesare agentic edits do **not** land on the live document (they park in a "Bozze di Cesare" draft tray); "Mostra modifiche" opens nothing; Cesare context chip is stale across navigation; `full` Cesare = fullscreen takeover; shell collapse + sessions-section gating diverge from spec.

### ⚠️ Corrected finding — "Not Found" was a tester error (NOT a blocker)

Initial sweep hit **Italian URL slugs typed directly** (`/sinossi`, `/scaletta`, `/location`…) which 404 → "Panoramica / Not Found". The app uses **English route slugs** (`/synopsis`, `/outline`, `/screenplay`, `/treatment`, `/locations`, `/schedule`, `/shooting-plan`) and the **LeftRail navigates to them correctly**. Re-tested via rail clicks: **all 11 views render**. B3/B4 = PASS. Sceneggiatura element legend (G1) = PASS ("Sceneggiatura SCENE ACTION CHARACTER…"). No page-rendering blocker exists. (TKT-LEAD-09 Italian-slug deep-links remain out-of-scope / separate spec — not a daily-use blocker since nav never emits Italian slugs.)

## User contract amendments (override the matrix)

From user images + messages this session — these are the real acceptance bar, esp. for the lead-final:

1. **Notion inline-trace pattern is canonical for ALL features** (Image 6). When Cesare edits, the open document **updates LIVE** behind a floating bottom-right chat; trace renders inline (`N steps › → Thought › → Updated page X → Fatto → result card with Mostra/Nascondi modifiche + ↩ Annulla`). No detached SplitDrawer for the edit. The `full` Cesare takeover state is wrong for this model. Saved as project memory `project_notion_inline_trace_pattern`.
2. **Drawer model** (Image 2): doc must not be hidden by Cesare; either live-update behind floating chat (preferred per Image 6) or Notion half-page split. Current `full` = fullscreen takeover → wrong.
3. **Suggestions "tieni/scarta"** (Image 4): draft accept/reject must drive the same drawer, repositioned.
4. **Shell collapse** (Image 5): target = sidebar drops so header reaches left edge then disappears; hamburger ☰ + sidebar-in-popover on hover. Current = persistent icon-rail strip + `»` chevron (different model).
5. **Functional agentic flows to validate** (user, for lead-final): generate new Soggetto, change a scene, generate Sinossi + Trattamento, search a Location with Cesare adding candidates.

## Per-block results

### Block A · Auth + Dashboard

- A1 — INCONCLUSIVE — live session persisted; root → /dashboard (no logout to test redirect).
- A2 — INCONCLUSIVE — already authenticated.
- A3 — **PASS** — shell renders: LeftRail 240px + slim TopBar + BottomDock bottom-right (🔔 TU ⚙ ✦Cesare). `A3-dashboard.png`
- A4 — **PASS** — no double-dock observed.
- A5 — not tested (no hover-reveal observed in normal use); INCONCLUSIVE.
- A14/FU-44-14 — filter-row stacks at 756px (viewport artefact) — INCONCLUSIVE at true desktop width.

### Block B · LeftRail nav

- B1 — **PASS** — seed project opens.
- B2 — **PARTIAL** — header + Sviluppo + Produzione + Recents + tool row present; **Sessioni Cesare missing unless Cesare open** (see F1).
- B3 — **PASS** — all Sviluppo items render via rail (English slugs: soggetto, synopsis, outline, treatment, screenplay).
- B4 — **PASS** — all Produzione items render via rail (breakdown, budget, schedule, locations, shooting-plan).
- B5 — **PASS** — active item highlighted.

### Block C · Collapse + hamburger

- C1 — **PASS (state)** / **FAIL (visual model)** — ⌘\ → `data-shell=collapsed`, but rail collapses to a persistent **icon-rail strip**, not full-hide + hamburger (Image 5). `C1-collapsed.png`
- C2–C4 — INCONCLUSIVE — overlay model differs from spec; `»` chevron is the re-expand affordance.
- C5 — **PASS** — `»` returns collapsed → full.
- C6 — **PASS** — ⌃⌥F → `data-shell=focus`.
- C7 — **PASS (chrome hidden)** — focus hides rail (w=0) + topstrip + dock; only `»` + search remain. Editor body rendered blank at this viewport — recheck at desktop. `C7-focus.png`
- **Note:** `»` button `aria-label="Focus mode (⌃⌥F)"` but it toggles collapse/expand → **FU-44-03 mislabel (minor→major for a11y/clarity)**.

### Block D · Cesare drawer

- D1 — **PASS** — ✦ opens drawer bottom-right (`cesare=expanded`). `D1-cesare-open.png`
- D2 — INCONCLUSIVE (viewport too small for pixel-stability); **model wrong** per Image 2/6.
- D3 — **PASS** — header: ✦ name + session + SOGGETTO chip + ↗ − ×.
- D4 — **FAIL (major)** — ↗ → `full` is a **fullscreen takeover** (editor hidden, w=38px), not Notion half-page/live-doc. `D4-cesare-full.png`
- D5 — **PASS** — sessions selector lives in LeftRail, not Cesare header.

### Block E · Cesare reply (the reported bug)

- E1 — **PASS** — type "ciao" + send → context-aware reply ("…stai lavorando al soggetto di Open Grezzo…"). **Image-3 "can't type / no reply" does NOT reproduce on current head.** `E2-cesare-reply.png`
- E2 — **PASS** — reply within ~10s.
- E3 — **PASS** — second message replies; autoscroll affordance "↓ Vai alle nuove risposte".
- E4 — **PASS** — tool message accepted; Cesare reasons before acting.
- E5 — **PASS** — ChangeTrace block renders ("6 passaggi ▾ / Aggiornato Soggetto / 1 MODIFICA / Mostra modifiche"). `E5-trace.png`
- E6 — **PASS** — ▾ expands timeline ("Lettura contesto / soggetto / Entità aggiornate"). `E6-trace-expand.png`
- E7 — **FAIL (blocker)** — "Mostra modifiche" only toggles inline text to "Nascondi modifiche"; **no SplitDrawer opens, `data-split` never set, and the editor does not update**. Matches Image-3 "show/hide non fa niente". `E7-mostra-modifiche.png`, `E7b-mostra-after-gen.png`
- E8 — not reachable (no applied effect to revert in the live doc).

### Block E′ · Functional generation (user-requested, canonical-pattern check)

- **Generate new Soggetto** — **FAIL (blocker)** — Cesare ran 6 passaggi, said "applico direttamente al documento / Aggiornato Soggetto", but the **live editor content is unchanged**. The generated draft landed in **"Bozze di Cesare → 2 draft"** tray (Confronta/Promuovi/Scarta), NOT the open document. Violates canonical Notion pattern (Image 6: doc updates live). `E7b-mostra-after-gen.png`
- Sinossi / Trattamento generation — blocked: pages render "Not Found" (B3).
- Location candidates — blocked: page renders "Not Found" (B4).

### Block F · Sessions in LeftRail

- F1 — **FAIL (major)** — "Sessioni Cesare" section appears **only when `cesare=expanded`**; disappears when closed. Spec requires always-visible.
- F2 — **PASS** — one default session ("Sessione principale").
- F3–F7 — INCONCLUSIVE (gated behind F1; partial: "+ Nuova" present).

### Block G · Per-page mitigations

- All blocked by the "Not Found" rendering failure for Sinossi/Scaletta/Trattamento/Sceneggiatura/Calendario/Location/Inquadrature.
- Soggetto (G5–G8), Breakdown (G3–G4), Budget (G10) — render but not deep-checked this iter (viewport). INCONCLUSIVE.

### Block H · Notifications — not reached (timebox). INCONCLUSIVE.

### Block I · Persistence — not reached (timebox). INCONCLUSIVE.

### Block J · FloatingDock anchors — not reached (timebox; pages broken). INCONCLUSIVE.

## Failures grouped by responsible fix-agent

### fix-agent-pages — NOT NEEDED THIS ITER

- The "Not Found" failure was a tester error (Italian slugs). All views render. No page-rendering work required. Per-page deep checks (G5–G10) deferred to iter-2 once Cesare live-doc lands.

### fix-agent-cesare (BLOCKER + major) — first priority

- **Agentic edit does not land on live document** (canonical pattern). Generated Soggetto went to "Bozze di Cesare" draft tray instead of updating the open editor.
  - Expected (Image 6): apply edit live to the open document; auto-create version under the hood; show inline trace + `↩ Annulla`. No manual "Promuovi a attiva" step for the primary flow.
- **F1: "Sessioni Cesare" must be always visible** in LeftRail, not gated on `cesare` state.
  - Files: LeftRail sessions section render guard + sessions context provider.
- **Cesare context chip is STALE across navigation** — chip stuck on "SCENEGGIATURA" while on /sinossi and /location; prompt suggestions also screenplay-scoped on wrong page.
  - Expected: chip + suggestions react to active route/view.

### fix-agent-split (BLOCKER) — third priority

- **E7: "Mostra modifiche" opens nothing.** Either wire it to open the SplitDrawer (target page + diff) OR — per user canonical pattern — make it a live-diff toggle on the already-updated open document. Coordinate with fix-agent-cesare on which model wins (recommendation: live-doc, drop detached SplitDrawer for edits).
  - Files: `SplitDrawerHost` payload routing, ChangeTrace `onShowChanges` handler.

### fix-agent-shell (major + minor)

- **D4: `full` Cesare = fullscreen takeover** — drop or redefine. Notion model has no full-takeover; keep floating drawer with doc visible/live. (May be shared with fix-agent-cesare/design.)
- **C1 collapse visual model** vs Image 5 (icon-rail vs full-hide+hamburger). Major UX divergence — confirm with user whether to adopt Image-5 model or keep icon-rail. (Recommend AskUser before building.)
- **FU-44-03: `»` chevron mislabeled** `aria-label="Focus mode"` while it toggles collapse/expand.

### fix-agent-design (minor)

- Trace verbosity vs Notion compact form (`N steps › Thought › Updated page X › Fatto`) — align ChangeTrace chrome.

## Deferred to spec 45 (minor/cosmetic, do not block)

- A14 filter-row stack — re-verify at true 1280px desktop (viewport artefact suspected).
- ChangeTrace label/format polish.

## Open questions for user (recommend AskUser before fix-agent-shell builds C1)

- Shell collapse: adopt Image-5 full-hide + hamburger-popover, or keep current icon-rail? This changes the LeftRail collapse architecture.
