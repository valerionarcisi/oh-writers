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

- **[logline] Investigate the real logline bug** — manual edit + persist verified working
  (live repro + `tests/documents/logline-manual.spec.ts`); Cesare path only mock-tested.
  **Blocked on:** Valerio's manual repro (which exact path/steps fail). See `docs/LEARNINGS.md`.

## NEXT (prioritised)

1. **[55] Shell action standard — context-aware TopBar** — `docs/specs/55-shell-action-standard.md`.
   Unblocks audit C-01/C-02 + Spec 56 Phase 2 remainder + the rail rework. Big.
2. **[A-01] Screenplay ⋯ menu opens off-screen** — `DropdownMenu` flip-up — audit A-01.
3. **[C-01/C-02] pointer-events family** — SIAE submit + new-session send intercepted (shared stacking root cause) — audit C-01/C-02.
4. **[A-03] Viewer never gets live narrative/Soggetto edits** — `FreeNarrativeEditor.tsx:66` — audit A-03.
5. **[A-04] "Opportunità" nav entry missing in rail** — audit A-04.
6. **[A-05] ~50 hardcoded `it-IT` Intl formatters** — dates/numbers wrong in EN — audit A-05.
7. **[A-06] Hardcoded IT strings in `packages/ui`** (Cesare drawer, rail) — audit A-06.
8. **[A-07/08/09] a11y** — nested button (PeekRow), DropdownMenu trigger focus ring, CommandPalette combobox — audit A-07/08/09.
9. **[56-1b] a11y axe automation** — needs approval to add `@axe-core/playwright` — `docs/specs/56-continuous-qa-system.md` Phase 1b.
10. **[56-2] DS Phase 2 remainder** — single-home action check + shell-zone structural assertions (needs Spec 55) — spec 56 Phase 2.
11. **[56-3/4] Visual regression + DoD gate + heuristic loop + Stop-hook wiring** — spec 56 Phase 3/4.

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
