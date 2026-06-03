# Bugs — live ledger

The detail home for bugs we are actively tracking. `docs/BACKLOG.md` queues them (one
line + link here); this file holds the repro + proof. Point-in-time audit findings live
in their audit report (e.g. `docs/audits/2026-06-03/CONSOLIDATED.md`); when one is pulled
into work, copy its detail here.

**Entry format:**

```
### BUG-NNN — short title (YYYY-MM-DD)
- Severity: ALTO | MEDIO | BASSO
- Status: open | in-progress | fixed (commit)
- Repro: page → action → observed result
- Proof: screenshot path / file:line / repro steps
- Notes / suspected cause
```

A bug is fixed only per `docs/conventions/definition-of-done.md` (tests at every layer,
E2E first; screenshots in a recap; gates green).

---

## Open

_(none logged yet in this ledger — new bugs land here as we find them)_

## Archived

### BUG-001/002/003 — narrative editor (Enter, counters, list button) — **Fixed, spec 04e (2026-04-18)**

Tiptap ↔ React 19 re-render coupling; replaced Tiptap with vanilla ProseMirror. Placeholder
fix: `Decoration.node` + CSS `::before`. E2E: `tests/documents/narrative-editor-regressions.spec.ts`.

### BUG-004 — "32 failing Playwright tests" (2026-04-18) — **Likely obsolete, revalidate**

Triaged as tech debt in April (screenplay pmDoc mount + title-page autosave race). The UI
had a full v3 redesign since and CI E2E (mock-ui) is green, so this snapshot is almost
certainly stale. Do NOT treat as open — if a specific spec is red today, log it as a fresh
BUG-NNN with a current repro.
