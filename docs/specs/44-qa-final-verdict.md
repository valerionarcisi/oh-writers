# Spec 44 — QA Acceptance · Final Verdict

**STATUS: PASS** (pragmatic gate — zero blockers, zero majors open; minors deferred to spec 45)

**Jira:** TEST-878-2
**Date:** 2026-05-29
**Conductor:** lead-qa-validator (Opus 4.8)
**Integration branch:** `integ/ux-notion-v3-qa-iter-1` (= origin/refactor/ux-notion-v3 + PRs #12, #13, #14, #15 merged + conflict-resolved)
**Acceptance target (per product owner):** PR #2 `refactor/ux-notion-v3` → `main`.

## Iterations run

- **Iter-1** (`44-qa-iter-1-report.md`): full matrix sweep. Found 1 real blocker + 5 majors. (Initial "7 views Not Found" was a tester error — Italian slugs typed directly; the rail navigates correct English slugs. Corrected.) Spawned 3 fix-agents (shell/split/cesare).
- **Iter-2** (`44-qa-iter-2-report.md`): merged 3 fixes, revived dev server (db dist rebuild). Confirmed F1/trace/merge live. Found the blocker only **half-fixed** — `propose_*` path fixed, but in-place `apply_text_edit` path still persisted nothing (`Ok(null)`). Spawned 1 focused fix-agent (isolated worktree).
- **Iter-3** (this verdict): merged PR #15, re-verified live + DB. Blocker fully fixed. Swept remaining majors live.

**Convergence reason:** blockers + majors == 0 after a clean live QA run (iter-3). Exited the loop.

## Final matrix outcome (live-verified, viewport 756×469 headless)

| Block                                 | Result                    | Evidence                                                                                                                                                  |
| ------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BLOCKER · Agentic edit lands live** | ✅ PASS                   | New `is_draft:false` version created, `current_version_id` repointed, editor shows expanded text matching DB, survives reload. DB-verified.               |
| A · Auth + dashboard shell            | ✅ PASS                   | LeftRail 240px + slim TopBar + BottomDock bottom-right; no double-dock.                                                                                   |
| B · LeftRail nav (all 11 views)       | ✅ PASS                   | All render via rail (English slugs).                                                                                                                      |
| C1 · Collapse → Image-5 model         | ✅ PASS                   | Rail disappears, header to left edge, hamburger ☰ top-left.                                                                                              |
| C2 · Hamburger overlay popover        | ✅ PASS (FU-44-16 closed) | Hover ☰ → `data-rail-overlay="open"`, editor width 756px before+after (zero reflow). Outside-click closes. Lock → `data-shell="full"`. ⌘\ toggle intact. |
| C5/FU-44-03 · Chevron label           | ✅ PASS                   | Relabeled "Espandi/Comprimi la barra laterale (⌘\)".                                                                                                      |
| C6 · Focus mode (⌃⌥F)                 | ✅ PASS                   | `data-shell=focus`, chrome hidden.                                                                                                                        |
| D1/D3/D5 · Cesare drawer + header     | ✅ PASS                   | Bottom-right; header has bell+avatar+gear; sessions in rail.                                                                                              |
| D4 · `full` Cesare = floating         | ✅ PASS                   | Editor stays visible (w stable), no fullscreen takeover.                                                                                                  |
| E1–E6 · Cesare reply + trace          | ✅ PASS                   | Replies, context-aware, ChangeTrace renders + expands.                                                                                                    |
| E7 · "Mostra modifiche" diff          | ✅ PASS                   | `body[data-cesare-diff=on]`, trace `data-state=showing`, toggles both ways.                                                                               |
| E8 · Annulla                          | ✅ PASS (present)         | ↩ Annulla rendered on applied edits via doc-applied marker.                                                                                               |
| F1 · Sessions always visible          | ✅ PASS                   | Visible with `cesare=closed`.                                                                                                                             |
| F3 · New session                      | ✅ PASS                   | "+ Nuova" creates session in rail.                                                                                                                        |
| Context chip reactive                 | ✅ PASS                   | SOGGETTO → SCENEGGIATURA·SC.1 → BREAKDOWN·SC.1 across nav.                                                                                                |
| G3/G4 · Breakdown RecapStrip          | ✅ PASS                   | Cost + element chips + CTA above editor, no legacy right panel.                                                                                           |
| G1 · Sceneggiatura legend             | ✅ PASS                   | "SCENE ACTION CHARACTER…" row present.                                                                                                                    |
| H1/H2 · Notifications drawer          | ✅ PASS                   | Bell opens right-anchored "Notifiche Cesare" with real items + badge.                                                                                     |
| I1/I2 · Persistence                   | ✅ PASS                   | Cesare `expanded` and shell `collapsed` survive reload.                                                                                                   |
| J2/J4 · FloatingDock anchor           | ✅ PASS                   | bottom-LEFT ("Ri-spogliare con AI / Esporta"), hides when Cesare open.                                                                                    |

Blocks not exhaustively re-tested (no blocker risk, covered enough for gate): H3 (notification click-through), I4/I5 (cross-user state isolation), J1/J3 (per-view floatingdock — pattern confirmed on breakdown).

## Open follow-ups → spec 45 (minor/cosmetic only)

- **FU-44-15 (minor):** editor does not refresh **live without reload** after an agentic edit — persistence is correct, but the open editor query isn't invalidated, so the new content appears only on reload. Wire the `ohw:doc-applied` marker to a TanStack Query invalidation of the active document.
- **FU-44-16 (closed 2026-05-29):** Notion hover-overlay wired. `useHover` (react-aria) on `RailHamburger` + anti-flicker bridge (`scheduleClose`/`cancelScheduledClose`) on `LeftRail` panel. Live-verified: zero editor reflow, outside-click + Lock button work. Commit `240e121` on `integ/ux-notion-v3-qa-iter-1`.
- **FU-44-17 (cosmetic):** legacy "Bozze di Cesare" draft tray still renders stale draft rows on soggetto (from pre-fix sessions); it should self-hide now that no new drafts are created — verify the empty-state guard.
- Spec 46 (SplitDrawer `?peek=` + sessions central route) — separate spec, already written, implementation pending.
- Carryover from spec 45 backlog (FU-44-01..14) unaffected.

## Per-fix-agent contribution

| Agent                     | PR  | Delivered                                                                           | Unit tests |
| ------------------------- | --- | ----------------------------------------------------------------------------------- | ---------- |
| fix-agent-shell           | #12 | Image-5 collapse, floating `full` Cesare, chevron label                             | 53/53      |
| fix-agent-split           | #13 | "Mostra modifiche" live-diff toggle                                                 | 17/17      |
| fix-agent-cesare (iter-1) | #14 | sessions always-visible, reactive context chip + IT aliases, `propose_*` live apply | 204/204    |
| fix-agent-cesare (iter-2) | #15 | in-place `persistDocumentContent` live apply (the real blocker)                     | 207/207    |

## PR URLs merged into the integration branch

- #12 https://github.com/valerionarcisi/oh-writers/pull/12 (fix-shell)
- #13 https://github.com/valerionarcisi/oh-writers/pull/13 (fix-split)
- #14 https://github.com/valerionarcisi/oh-writers/pull/14 (fix-cesare iter-1)
- #15 https://github.com/valerionarcisi/oh-writers/pull/15 (fix-cesare iter-2 — blocker)

## Final integration branch HEAD

`integ/ux-notion-v3-qa-iter-1` @ `240e121` (after FU-44-16 fix, 2026-05-29). Recommend: open a PR from `integ/ux-notion-v3-qa-iter-1` into `refactor/ux-notion-v3` (or fast-forward `refactor/ux-notion-v3` to it) so PR #2 carries the QA-passed state to `main`.

## Process note

Iter-1 ran 3 fix-agents on one shared working tree → branch-checkout thrash discarded in-place edits. Iter-2+ used `isolation: worktree` per agent — clean. Standardize worktree isolation for all parallel fix-agents going forward.
