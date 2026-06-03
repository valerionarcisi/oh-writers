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

- **Narrative UI/UX — analyse & fix one-by-one** — 25 findings from Valerio's 2026-06-03
  walk, grouped in `docs/BUGS.md` (N-01..N-25). Pick the next finding/topic, branch, fix
  per DoD, merge, `/clear`, repeat. (Start point to be chosen.)

## NEXT (prioritised — narrative walk topics, then the rest)

1. **[Topic 1 / Spec 55] TopBar standard** — exports + versions + notifications + save, all "near the lens"; per-page tool pattern; drawers always SplitDrawer; kill old drawers. `docs/specs/55-shell-action-standard.md` + BUGS N-01..N-04. **Backbone — unblocks Topics 5, parts of others.**
2. **[Topic 4] Logline + nav** — clicking logline opens nothing (N-16); Soggetto missing from sidebar (N-17).
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

- The deferred "Ma an…" shell example (user dropped it).
- Timeline Scaletta verticale (spec 15) · Moodboard/Storyboard (spec 19) · Billing & multi-tenancy (16-core) · AI auto-gen from screenplay (14/14b).
- BYOK encrypted user key + model choice (noted in spec 48).

## DONE (recent — trim periodically)

- [M-12] Rail single footer (tools → top, Notion-style) — superseded by Spec 55 TopBar later.
- Audit AI reale 2026-06-03 — 5 auditors + Lead gate — `docs/audits/2026-06-03/CONSOLIDATED.md`.
- [56-1] Route-coverage smoke + fixed dead routes /teams & /logline — wired into CI.
- [56-2a] DS-consistency guard (no inline gating + rogue-hex ratchet).
- [logline] E2E tests — manual edit + Cesare-assisted (mock).
- Specs 55 + 56, `docs/conventions/ui-ux-research.md`, `docs/LEARNINGS.md`.
