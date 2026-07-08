# Spec 81 — Cesare editorial advice system

Status: **Implemented** (2026-07-08)

## Context

Cesare's narrative suggestions were split across narrative docs and screenplay, with
different schemas, duplicate UIs, and a prompt bias toward always finding a new
problem. That produced an endless-review loop: even when a text was intentionally
elliptical or already solid, Cesare kept asking for more explanation, symmetry, or
resolution.

## Decision

Introduce one shared **editorial advice** contract for Cesare suggestions across:

- narrative docs (`logline`, `soggetto`, `synopsis`, `outline`, `treatment`)
- screenplay polish

Every suggestion is classified by:

- `type`: `real_problem` | `risk` | `authorial_choice` | `optional` |
  `already_resolved` | `approved`
- `severity`: `high` | `medium` | `low` | `optional`
- `status`: `open` | `ignored` | `authorial_choice` | `resolved` | `approved`

The shared contract also carries short editorial fields (`title`, `body`) plus optional
detail fields (`whyItMatters`, `whenToIgnore`, `minimalIntervention`) and optional
screenplay-edit fields (`scene`, `snippet`, `find`, `replace`).

## Behaviour contract

1. **Intention-aware prompts**
   Cesare receives the project title / genre / format and, when available, the current
   logline as grounding context before analysing the current surface.

2. **No advice-for-obligation**
   The prompt explicitly forbids turning every ambiguity into an error and asks whether a
   change makes the text stronger or only more conventional.

3. **Approval is a first-class outcome**
   If no high/medium issue remains, or only low/opzionale notes survive after filtering,
   the UI shows an `approved` editorial card instead of an empty or anxious state.

4. **Anti-loop memory is local to the surface**
   The client stores per-surface advice statuses in local storage, keyed by a lightweight
   content fingerprint. If the writer marks a note as ignored / authorial choice /
   resolved / approved, that note does not come back on the same content revision.
   Substantial content changes reset the local memory automatically.

5. **Shared UI**
   Narrative-doc notes and screenplay polish render through one shared editorial-card
   system with:
   - compact header chips (area, type, severity, status)
   - short editorial title + body
   - optional detail disclosure
   - shared action row
   - separate optional fine-tuning section

## Scope limits

- This spec does **not** persist advice-review status to the DB. Anti-loop memory is
  local UI state only for now.
- This spec does **not** add a new public no-auth app mode. Validation can use seeded
  auth in mock mode; manual no-auth support remains a separate product decision.

## Tests

- Unit: shared editorial-advice schema helpers
- Unit: narrative prompt/tool contract
- Unit: prompt seeding from advice card actions
- E2E/mock: narrative advice card behaviour and honest Cesare outcomes remain covered by
  the existing Cesare agentic suites
