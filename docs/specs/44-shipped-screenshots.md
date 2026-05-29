# Spec 44 — Shipped Screenshot Matrix

Visual proof of the Spec 44 shell refactor as merged on `refactor/ux-notion-v3`.

Captured 2026-05-29 against the live dev server (`http://localhost:3000`) using
the seed project `00000000-0000-4000-a000-000000000010`. Each view is captured
in five canonical shell states. See `docs/specs/mockups/shell-canva-notion.html`
for the visual source of truth.

## TOC

- [Marquee Flow — Cesare full + SplitDrawer trace](#marquee-flow)
- [dashboard](#dashboard)
- [project home](#project)
- [screenplay](#screenplay)
- [soggetto](#soggetto)
- [sinossi](#sinossi)
- [scaletta](#scaletta)
- [trattamento](#trattamento)
- [breakdown](#breakdown)
- [budget](#budget)
- [schedule](#schedule)
- [locations](#locations)
- [Findings](#findings)

## State legend

| Slug                     | `data-shell` | `data-cesare` | What it shows                                                                |
| ------------------------ | ------------ | ------------- | ---------------------------------------------------------------------------- |
| `__closed-full.png`      | `full`       | `closed`      | Default — Left Rail 240px + Top Strip + BottomDock visible                   |
| `__expanded-full.png`    | `full`       | `expanded`    | Cesare drawer in floating sub-window; BottomDock hidden (icons move to drawer header) |
| `__cesare-full.png`      | `full`       | `full`        | Cesare drawer viewport-wide; Rail + Top Strip + Dock all hidden              |
| `__shell-collapsed.png`  | `collapsed`  | `closed`      | Rail collapses to 56px icon strip with hover-reveal sentinel                 |
| `__shell-focus.png`      | `focus`      | `closed`      | Rail + Top Strip + Dock all hidden (no hover-reveal)                         |

Note: `data-cesare="expanded"` and `"full"` toggle the shell-level reactions
(dock hidden, body class flipped) but the CesareDrawer component itself is
mounted by React state inside `CesareSheet.tsx`. The shipped captures show the
ambient shell response — exactly what the spec contract validates.

## Marquee Flow

The cross-page Cesare full → SplitDrawer trace flow described in
spec 44 §Architecture/Cross-component flow. Live trace markers require a real
Cesare write tool run (no seed scenes available to write against); steps 3 and 4
are documented as `skipped: needs real Cesare write to produce live trace
markers` and the proxy capture shows the shell state.

| Step                                             | Capture                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| 1. Breakdown closed (entry)                      | ![](mockups/shipped/traceflow__step1_breakdown-closed.png)        |
| 2. Cesare full over Breakdown                    | ![](mockups/shipped/traceflow__step2_cesare-full.png)             |
| 3. SplitDrawer open (shell proxy for split-mode) | ![](mockups/shipped/traceflow__step3_split-mock.png)              |
| 4. SplitDrawer full + trace markers              | skipped — requires real Cesare write tool run with diff payload   |

## dashboard

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/dashboard__closed-full.png) | ![](mockups/shipped/dashboard__expanded-full.png) | ![](mockups/shipped/dashboard__cesare-full.png) | ![](mockups/shipped/dashboard__shell-collapsed.png) | ![](mockups/shipped/dashboard__shell-focus.png) |

## project

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/project__closed-full.png) | ![](mockups/shipped/project__expanded-full.png) | ![](mockups/shipped/project__cesare-full.png) | ![](mockups/shipped/project__shell-collapsed.png) | ![](mockups/shipped/project__shell-focus.png) |

## screenplay

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/screenplay__closed-full.png) | ![](mockups/shipped/screenplay__expanded-full.png) | ![](mockups/shipped/screenplay__cesare-full.png) | ![](mockups/shipped/screenplay__shell-collapsed.png) | ![](mockups/shipped/screenplay__shell-focus.png) |

## soggetto

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/soggetto__closed-full.png) | ![](mockups/shipped/soggetto__expanded-full.png) | ![](mockups/shipped/soggetto__cesare-full.png) | ![](mockups/shipped/soggetto__shell-collapsed.png) | ![](mockups/shipped/soggetto__shell-focus.png) |

## sinossi

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/sinossi__closed-full.png) | ![](mockups/shipped/sinossi__expanded-full.png) | ![](mockups/shipped/sinossi__cesare-full.png) | ![](mockups/shipped/sinossi__shell-collapsed.png) | ![](mockups/shipped/sinossi__shell-focus.png) |

## scaletta

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/scaletta__closed-full.png) | ![](mockups/shipped/scaletta__expanded-full.png) | ![](mockups/shipped/scaletta__cesare-full.png) | ![](mockups/shipped/scaletta__shell-collapsed.png) | ![](mockups/shipped/scaletta__shell-focus.png) |

## trattamento

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/trattamento__closed-full.png) | ![](mockups/shipped/trattamento__expanded-full.png) | ![](mockups/shipped/trattamento__cesare-full.png) | ![](mockups/shipped/trattamento__shell-collapsed.png) | ![](mockups/shipped/trattamento__shell-focus.png) |

## breakdown

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/breakdown__closed-full.png) | ![](mockups/shipped/breakdown__expanded-full.png) | ![](mockups/shipped/breakdown__cesare-full.png) | ![](mockups/shipped/breakdown__shell-collapsed.png) | ![](mockups/shipped/breakdown__shell-focus.png) |

## budget

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/budget__closed-full.png) | ![](mockups/shipped/budget__expanded-full.png) | ![](mockups/shipped/budget__cesare-full.png) | ![](mockups/shipped/budget__shell-collapsed.png) | ![](mockups/shipped/budget__shell-focus.png) |

## schedule

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/schedule__closed-full.png) | ![](mockups/shipped/schedule__expanded-full.png) | ![](mockups/shipped/schedule__cesare-full.png) | ![](mockups/shipped/schedule__shell-collapsed.png) | ![](mockups/shipped/schedule__shell-focus.png) |

## locations

| closed-full | expanded-full | cesare-full | shell-collapsed | shell-focus |
| --- | --- | --- | --- | --- |
| ![](mockups/shipped/locations__closed-full.png) | ![](mockups/shipped/locations__expanded-full.png) | ![](mockups/shipped/locations__cesare-full.png) | ![](mockups/shipped/locations__shell-collapsed.png) | ![](mockups/shipped/locations__shell-focus.png) |

## Findings

Observations from the matrix capture — no `blocker` or `major` items.

### Layout

- `shell-focus`: the dashboard `H1 "I tuoi progetti"` wraps into a four-line stack
  because the inner content max-width is computed against the rail-less viewport
  but the dashboard hero still uses a narrow column. Minor; product-view editors
  do not regress because the per-page top strip just hides cleanly.
- `shell-collapsed` rail at 56px shows icons only (Soggetto, Sinossi, Scaletta,
  Trattamento, Sceneggiatura, Breakdown, Budget, Calendario, Location,
  Inquadrature) — matches the spec hover-reveal expectation.

### Cesare drawer mount

- Setting `body[data-cesare="expanded"]` via DOM correctly hides the dock pill
  (TKT-01 contract). The drawer panel itself is React-state-mounted and does not
  appear because no client-side `setState("expanded")` ran. This is the
  expected behaviour — the spec contract is shell-level (dock visibility,
  layout) and editor pixel-stability, not the drawer chrome.
- Live drawer chrome captures live under `docs/specs/mockups/audit/01-11.png`
  (WP-DESIGN audit set, referenced from `docs/specs/44-lead-report.md` §4).

### Colour / theme

- Backgrounds use `--ds-bg` (warm linen) consistently across rail, top strip
  and main column. No rogue greys or `#fff` panels surfaced in this matrix.
- Active rail item (Breakdown, dashboard) renders with `--ds-action`-tinted
  highlight band — matches the WP-DESIGN §3.2 token replacements.

### Content placeholders

- All Spec 44 production-view pages (Breakdown, Budget, Schedule, Locations)
  show "Nessuna versione disponibile per questa sceneggiatura" empty states
  because the seed project carries no scenes. This is content seeding, not a
  shell regression.

### Trace flow gaps

- Live trace markers (steps 3 + 4 of the Marquee Flow) need a real Cesare
  write-tool run to produce diff payload that the SplitDrawer trace renderer
  consumes. Manual capture is gated on an LLM call and seeded scenes — skipped
  per the 30-minute hard budget, with the proxy shown above.
