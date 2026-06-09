# Spec 68 — Narrative coherence warnings (cross-document consistency checks)

Status: **Planned** (2026-06-09). Not built. Pulled from a real-use report: after
importing a screenplay (`with-title-page.pdf` → "THE LAST FRAME / Jane Doe") into a
project whose Soggetto/Sinossi/Scaletta/Trattamento describe a different story
("Non fa ridere" / Filippo, pizzeria), nothing warned the writer that the imported
screenplay is **incoherent** with the rest of the development pipeline.

## Why

Oh Writers' moat is that all the narrative documents (Soggetto → Sinossi → Scaletta
→ Trattamento → Sceneggiatura) describe the **same** film. When one document diverges
— a different protagonist, a different premise, a different title, a contradicted
plot beat — the writer should be told, not left to discover it during budgeting or
on set. Today there is no consistency layer; each document is edited in isolation.

The trigger that surfaced this: **import** is the sharpest case (a foreign PDF can
replace one document wholesale), but the check must hold for **every narrative
surface**, every edit — not just import.

## What (scope)

A **coherence check** that compares a narrative document against the project's other
narrative documents (and the Film Bible / structured memory, when present — see
[[project_memory_layer_decision]]) and surfaces a **non-blocking warning** when it
detects a logical/narrative inconsistency.

Classes of inconsistency to detect (initial set):

- **Identity drift** — protagonist / key character names or roles differ across
  documents (e.g. Soggetto says "Marta", the imported screenplay says "Jane").
- **Premise drift** — the logline/premise of one document contradicts another.
- **Title drift** — the screenplay title page vs. the project title (note: import
  no longer auto-renames the project — see BUG-N43 — so this is now a _surfaced
  warning_, not a silent rename).
- **Plot/beat contradiction** — a scene or beat contradicts an established fact in
  the Trattamento/Scaletta.
- **Setting/era drift** — time period or location set differs.

Output contract:

- A **warning banner / chip** on the affected document (non-blocking; the writer can
  dismiss or open detail). Never a hard error, never a modal that blocks editing.
- Detail view lists each inconsistency with **which two documents disagree** and the
  conflicting text, so the writer can decide which is canonical.
- The check is **AI-backed** and therefore MUST follow the Cesare tracer invariant
  (CLAUDE.md → Agentic Edit Pattern): if Cesare runs the comparison, it streams its
  step trace (`reading{doc}` → reasoning → `done` → result). No silent analysis.

## Where it must appear

**Every narrative part** — Soggetto, Sinossi, Scaletta, Trattamento, Sceneggiatura.
A uniform surface (like the per-feature `⋯` menu in Spec 67), not a per-document
bespoke implementation.

## Open questions (resolve before building)

- **When does it run?** On import (definitely), on explicit "verifica coerenza"
  action, on a debounce after edits, or continuously? Continuous AI comparison is
  expensive — likely import + explicit + a cheap heuristic pre-filter (name/title
  diff) that escalates to the AI check only when the cheap signal fires.
- **Cost.** Cross-document AI comparison on every edit is a cost smoke concern
  (cost-smoke test mandatory per QA policy). Probably gate behind a heuristic.
- **Canonical source.** When two documents disagree, which is "right"? The writer
  decides; the tool only surfaces. But the Film Bible (when it exists) should be
  the reference.
- **Feature flag.** Gate via `resolveFeatures`/`useFeature` (CLAUDE.md rule), OFF=hidden.

## Tests (to define when built)

- Unit: the heuristic pre-filter (name/title/era diff) on document pairs.
- E2E (OHW-068): import an incoherent screenplay → warning appears on Sceneggiatura;
  dismiss works; opening detail shows the conflicting documents.
- Cost smoke: the AI comparison stays within budget.
- Cesare tracer: the comparison streams a step trace (product invariant).

## Related

- BUG-N43 (title-page import no longer renames the project — this spec turns that
  silent behaviour into a surfaced warning).
- Spec 67 (uniform per-feature surfaces) — model the warning surface on the same
  registry approach.
- [[project_market_analysis]] — contextual data integration is the stated AI moat.
