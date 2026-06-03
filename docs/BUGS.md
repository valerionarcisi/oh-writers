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

Narrative UI/UX manual walk — 2026-06-03 (Valerio). Grouped by topic; image refs are
the walk screenshots. Severity is provisional (to confirm during one-by-one analysis).

### Topic 1 — Action placement / TopBar standard (Spec 55)

The recurring "everything near the lens" pattern. Confirms + enriches `docs/specs/55-shell-action-standard.md`.

- **N-01** ALTO — Notifications still bottom-left; must move to the TopBar; they open in a SplitDrawer, and the **old notification drawer is removed** (img #3, #18).
- **N-02** ALTO — **Versions missing on all narrative pages**; must open in a SplitDrawer, **old VersionsDrawer removed**; place "Versioni" near the lens (img #15). (Spec 49 + 55.)
- **N-03** ALTO — **Exports** must sit near the lens, as a **per-page tool pattern across ALL narrative pages** (img #16, #20). One pattern, page-specific tools.
- **N-04** MEDIO — Drawers are ALWAYS SplitDrawer; clean up any legacy drawer (img #18).

### Topic 2 — Cesare drawer & chat UX

- **N-05** ALTO — Cesare **auto-opens**; it should **start closed** (img #4).
- **N-06** ALTO — In split view (`?peek=cesare`) the **text input to talk to Cesare is missing / not visible** (img #12, #13).
- **N-07** MEDIO — Chat layout: **fixed header + footer always visible, body scrolls, "go to end of chat" button** — same as Claude (img #13).
- **N-08** MEDIO — Improve the **response bubbles** UI (img #12).
- **N-09** MEDIO — **"Mostra/Nascondi modifiche" shows nothing** when toggled (img #11). (Spec 47e flash.)
- **N-10** MEDIO — **Markdown rendering problem** in Cesare messages (img #8).
- **N-11** BASSO — Suggestion cards (Cesare structure cards) placement needs rethinking (img #14).

### Topic 3 — Cesare sessions (pages & model)

- **N-12** MEDIO — Sessions list page UI too basic (img #5).
- **N-13** MEDIO — New-session **full-screen landing should live INSIDE AppShell**, not a bare takeover (img #6).
- **N-14** MEDIO — Session conversation page: **EN/IT language mix** + UI too basic (img #7).
- **N-15** QUESTION — Navigating between pages: should it spawn a **new session** or keep the same one? Design decision (img #10).

### Topic 4 — Logline & narrative nav

- **N-16** ALTO — ~~**Clicking the logline opens nothing** in some state~~ **FIXED (Spec 57)**. Root cause: the shared `Popover` primitive positioned itself with absolute CSS + a fixed width and **no viewport-collision handling**. At 1440 the centred TopBar pill's 480px popover just fit; on any narrower width (smaller window or a split/peek lane compressing the lane) it overflowed off the right edge → appeared to open nothing. Fix: primitive now portals + clamps/flips to the viewport (`computeAnchoredPosition`) and caps `max-inline-size`. Regression: `tests/documents/logline-popover-viewport.spec.ts` (1440/768/390).
- **N-17** MEDIO — ~~**"Soggetto" missing from the sidebar nav"**~~ **FIXED (Spec 57)**. Not missing — the EN label for `soggetto` was wrongly "Treatment outline" (colliding with the real "Treatment" item); with EN labels showing, Valerio read the first item as not-Soggetto. Corrected the EN label to "Soggetto" in all four key sites.

### Topic 5 — Narrative editor chrome

- **N-18** MEDIO — Screenplay: **remove the white border**, want only the centered text page (img #16).
- **N-19** ALTO — Screenplay top element-tabs (SCENE/ACTION/…) look hardcoded or buggy; **imports + previously-available functionality missing** from the toolbar; move these controls (img #17).

### Topic 6 — i18n leaks

- **N-20** ALTO — EN/IT mix across narrative + sessions + shell (e.g. "Continue screenplay", "Export PDF", "Saved", "2 online", session titles) (img #3,#7,#8,#16,#17,#20). Maps to audit A-05/A-06.

### Topic 7 — Shell & settings polish

- **N-21** BASSO — Redundant **"Oh Writers" label under the logo** (project switcher when no project) (img #3).
- **N-22** MEDIO — **Avatar click and gear both open the same page**; should differ: avatar → user settings, gear → project settings (img #17).
- **N-23** MEDIO — **Account settings page too narrow** (cramped column) (img #19).
- **N-24** BASSO — Project icon (e.g. "Non fa ridere"): unclear what it should open (img #4).

### Topic 8 — Feature idea (ICEBOX, needs spec)

- **N-25** FEATURE — **Live-draft via Cesare**: ask Cesare to write the soggetto → opens a SplitDrawer with a blank sheet → user dictates, Cesare writes & applies live → "ok, caricalo" commits it. Cesare can also **upload/attach a document**. (img #8) → own spec, not now.

## Archived

### BUG-001/002/003 — narrative editor (Enter, counters, list button) — **Fixed, spec 04e (2026-04-18)**

Tiptap ↔ React 19 re-render coupling; replaced Tiptap with vanilla ProseMirror. Placeholder
fix: `Decoration.node` + CSS `::before`. E2E: `tests/documents/narrative-editor-regressions.spec.ts`.

### BUG-004 — "32 failing Playwright tests" (2026-04-18) — **Likely obsolete, revalidate**

Triaged as tech debt in April (screenplay pmDoc mount + title-page autosave race). The UI
had a full v3 redesign since and CI E2E (mock-ui) is green, so this snapshot is almost
certainly stale. Do NOT treat as open — if a specific spec is red today, log it as a fresh
BUG-NNN with a current repro.
