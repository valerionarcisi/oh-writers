# Notion + Mockup Parity Audit

Spec 44 WP-QA — automated parity grid between three visual references:

1. `docs/specs/mockups/shell-canva-notion.html` (REFERENCE #1 — visual style)
2. Live Notion AI chat (REFERENCE #2 — interaction pattern; via chrome-agent)
3. Live local app at http://localhost:3000

- live-app captures: SKIPPED (dev server unreachable)
- notion screen capture: SKIPPED (chrome-agent unavailable)

## State matrix

| State                                              | Mockup                                   | Live app | Notes |
| -------------------------------------------------- | ---------------------------------------- | -------- | ----- |
| Cesare closed · shell full (BottomDock visible)    | mockup-cesare-closed-shell-full.png      | n/a      | —     |
| Cesare expanded · shell full (drawer bottom-right) | mockup-cesare-expanded-shell-full.png    | n/a      | —     |
| Cesare peek · shell full (peek bar bottom-right)   | mockup-cesare-peek-shell-full.png        | n/a      | —     |
| Cesare full-page (rail/topstrip/dock hidden)       | mockup-cesare-full-shell-hidden.png      | n/a      | —     |
| Shell collapsed (rail hidden, hamburger visible)   | mockup-cesare-closed-shell-collapsed.png | n/a      | —     |
| Shell focus (everything hidden)                    | mockup-cesare-closed-shell-focus.png     | n/a      | —     |

## Delta notes

Compare the rendered PNGs visually. Flag a divergence as a respawn ticket in
`docs/specs/44-respawn-tickets.md` when:

- the editor pixel-shifts on a Cesare transition (closed → expanded → peek → full → closed)
- the shell collapsed mode reflows the main content rather than overlaying the rail
- the Cesare full-page does NOT narrow when SplitDrawer opens in trace mode
- the BottomDock stays visible when Cesare ≠ closed
- the bell from BottomDock and the bell inside the Cesare header mount different drawers

Each ticket must contain: failed assertion, responsible WP agent name, failing file path, corrected expectation.
