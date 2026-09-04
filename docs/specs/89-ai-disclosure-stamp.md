# Spec 89 — AI disclosure stamp on exports

Status: **Planned**. Owner: Valerio.

## Problem Statement

As a screenwriter using Oh Writers, when I export a document that Cesare has
ever touched (narrative doc, screenplay, breakdown, or shooting schedule),
the exported artifact carries no indication of AI involvement. If a producer,
festival, or SIAE reader later learns the work had AI assistance and it
wasn't disclosed up front, that's a credibility and relationship risk for
me — even though nothing in EU law requires this disclosure today (confirmed
in issue [#147](https://github.com/valerionarcisi/oh-writers/issues/147),
research doc
[`docs/research/2026-09-04-eu-ai-act-article-50-cesare.md`](../research/2026-09-04-eu-ai-act-article-50-cesare.md)).
I want the export itself to be honest about this, proactively, before
industry norms or a counterparty force the question.

## Solution

Every export of a document, screenplay, breakdown, or shooting schedule that
Cesare has ever touched carries a visible "AI-assisted" note. The rule is
maximally cautious by design: **any** Cesare touch, ever, in that artifact's
history — even a single line — makes the note permanent, regardless of how
much the writer has since rewritten by hand. This avoids building (or
trusting) a proportional "how much was AI" measurement, which the current
tracking can't support anyway (see Implementation Decisions).

For documents with a title page (narrative docs, screenplay), the note lives
in the front matter the writer already sees and controls (`titlePageDoc`),
not as invisible file metadata — the point is honesty toward the reader, not
a compliance checkbox nobody sees. For breakdown and schedule exports, which
have no title page, an equivalent visible placement is defined per format.

## User Stories

1. As a screenwriter, I want my exported screenplay to show an AI-assistance
   note if Cesare ever contributed to it, so that I never have to explain to
   a producer after the fact why it wasn't disclosed.
2. As a screenwriter, I want the note to stay even after I've rewritten every
   Cesare-touched line by hand, so that I'm never in the position of
   defending a judgment call about "how much counts."
3. As a screenwriter, I want a fully human-written document (Cesare never
   opened) to export with no note at all, so that the disclosure stays
   meaningful and isn't diluted into a blanket disclaimer everyone ignores.
4. As a screenwriter, I want the note in my screenplay export to sit in the
   title page I already designed, not as a watermark or stamp that clashes
   with the professional formatting producers expect.
5. As a screenwriter, I want the note on my SIAE deposit export too, so that
   my legal deposit record is consistent with what I show a producer.
6. As a screenwriter exporting a breakdown or shooting schedule that Cesare
   helped organize (e.g. via `move_scene_to_day`, `merge_days`,
   `suggest_reorder`), I want that export to carry the same honesty, so that
   a line producer or 1st AD reading it isn't misled either.
7. As a screenwriter, I want the note's wording to be in Italian (the
   product's user-facing language), so that it reads naturally to the
   producers I'm actually sending these documents to.
8. As Valerio (product owner), I want this rule to require zero new judgment
   calls at export time — no "was this AI-assisted enough" prompt — so that
   the feature never blocks or confuses an export flow.
9. As a future engineer picking up screenplay or schedule AI-tool work, I
   want the Cesare-touch tracking convention already established by this
   spec, so that adding a new mutating tool doesn't silently create an
   undetected disclosure gap.

## Implementation Decisions

- **Trigger rule**: a document/screenplay/breakdown/schedule is "AI-touched"
  if any unit of its history was created or mutated by a Cesare tool call,
  ever. This is evaluated at export time by checking for the presence of at
  least one Cesare-attributed record anywhere in that artifact's data —
  binary, not proportional. No new measurement of "how much" Cesare wrote is
  built; the existing/new tracking fields (below) are presence checks only.

- **Tracking coverage, per surface** (this spec's actual scope of work is
  closing the two gaps):
  - **Narrative documents** (Soggetto/Sinossi/Scaletta/Trattamento) — already
    tracked. `document_versions.cesareSessionId` (non-null when a version
    originated from a Cesare session) is sufficient; no schema change.
  - **Breakdown** — already tracked, and more granularly than anywhere else
    in the product. `breakdown_occurrences.source` already distinguishes
    `"regex"` (auto-spoglio — deterministic extraction, not AI, no LLM call
    involved) / `"cesare"` (AI-suggested) / `"manual"` (user-added). No
    schema change; the export just needs to query for the presence of any
    `source = "cesare"` row scoped to the exported project/version.
  - **Screenplay** — gap. `screenplay_versions` has no equivalent field
    today. Add one, mirroring `document_versions.cesareSessionId` in shape
    (nullable session reference), populated whenever a Cesare tool
    generates or edits a scene.
  - **Schedule/shooting plan** — gap. Neither `shooting_days` nor `strips`
    (or whatever the schedule schema's mutable unit is) has a provenance
    field. Add one, populated whenever a Cesare tool
    (`move_scene_to_day`, `merge_days`, `swap_scenes`, `lock_day`/
    `unlock_day`, `suggest_reorder` — see `cesare-schedule-tools.ts` /
    `cesare-shooting-plan-tools.ts`) mutates the schedule.

- **Backfill for pre-existing data**: screenplay/schedule history that
  predates the new tracking fields has no way to know retroactively whether
  Cesare touched it. Default to **treating pre-existing untracked history as
  AI-touched** (the same maximum-caution stance as the trigger rule itself)
  rather than silently exempting it — a one-time data migration sets the new
  field to a sentinel "unknown, assume touched" value for any
  screenplay/schedule row that has evidence of Cesare activity in adjacent
  systems that already log it (e.g. existing Cesare session/tool-call logs,
  if queryable), falling back to "touched" for anything ambiguous.

- **Placement, per export format**:
  - **Narrative docs / screenplay PDF & DOCX** — the note is injected into
    the `titlePageDoc` ProseMirror document (the WYSIWYG front matter the
    export already follows literally, per the existing project rule "export
    follows the editor exactly, front page = titlePageDoc"). It appears as a
    small line near the existing metadata fields (author, draft date), not
    as a watermark across the script pages. The writer sees it in the editor
    before exporting — no export-time surprise.
  - **SIAE export** — same note, placed in the existing free-text deposit
    notes area of the SIAE PDF (the form already has a notes field; see
    `subject-export-siae.server.ts`).
  - **Breakdown PDF/CSV** — no title page exists for this format. Placement:
    a header line on the PDF export, and a leading metadata row on the CSV
    export (both formats already have a "no distinction of source" gap this
    spec also closes by surfacing `breakdown_occurrences.source` in the
    export, so this note is a natural extension of that same pass).
  - **Schedule/shooting-plan PDF export** — header line, matching the
    breakdown PDF placement for consistency.

- **Wording**: Italian, since it's user-facing copy shown to producers who
  read Italian scripts — goes through the i18n catalogue
  (`packages/domain/src/i18n/keys/`) as a new flat key, not a literal
  string. Exact copy to be drafted alongside implementation, reviewed by
  Valerio before shipping (not specified here — this is a product-voice
  decision, not an architectural one).

- **No new UI indicator before export**: the note only appears on the
  exported artifact itself, not as an in-app badge/banner in the editor.
  Rationale: the editor already shows Cesare's involvement in-context (the
  agentic edit trace, the versions panel) — a redundant persistent badge
  would be product clutter without adding information the writer doesn't
  already have.

## Testing Decisions

- Tests exercise the export surface (the seam users actually touch), not
  internal tracking-field plumbing directly — following the existing export
  test pattern (`tests/documents/narrative-export.spec.ts`,
  `tests/screenplay-editor/screenplay-export.spec.ts`,
  `tests/schedule/schedule-export.spec.ts`, `tests/soggetto/soggetto-export.spec.ts`).
- Each covered surface needs a same-shape pair: **sad path** — a document/
  screenplay/breakdown/schedule Cesare never touched exports with no note
  (proves the rule isn't a blanket disclaimer); **happy path** — one Cesare
  touch anywhere in history, note present on export.
- One additional case per surface: Cesare touches it, the writer then
  rewrites every AI-originated line by hand and creates a new manual
  version/checkpoint — note is still present (proves permanence, the
  spec's core invariant).
- Screenplay and schedule: an additional test asserting the new tracking
  field is actually populated when the relevant Cesare tool runs (e.g.
  `move_scene_to_day` sets the new schedule provenance field) — this is
  the one seam where the spec adds new plumbing, so it needs direct
  coverage in addition to the export-level assertion.
- Breakdown: no new plumbing test needed — `breakdown_occurrences.source`
  is already covered by existing breakdown tests; this spec only adds an
  export-level assertion that the export now surfaces it.

## Out of Scope

- Quantitative/proportional AI-authorship measurement (e.g. "40% AI-written")
  — the trigger rule is deliberately binary; building a real measurement
  system is a separate, much larger effort not undertaken here.
- Any in-app UI indicator before export (see Implementation Decisions).
- Changing SIAE's legal-deposit semantics beyond adding the note text — this
  spec does not touch SIAE's authorship/CF fields or add any new attestation
  clause.
- Retroactively notifying producers who already received an export before
  this feature shipped.
- Any EU AI Act compliance claim — this feature is explicitly NOT positioned
  as a legal requirement (see Problem Statement); it must not be described
  as such in the UI copy or in any external communication.

## Further Notes

- This spec's screenplay and schedule tracking additions are useful beyond
  this feature — any future work needing "did Cesare touch this" at the
  screenplay/schedule level (analytics, cost attribution, audit) can reuse
  the same fields instead of re-deriving the signal.
- Backfill default ("assume touched" for ambiguous pre-existing history) is
  intentionally the safe-but-lossy choice. If this later proves too noisy in
  practice (e.g. most historical screenplays get stamped even though a human
  wrote 100% of them), revisit — but don't relax the default without
  evidence, per the same maximum-caution reasoning behind the trigger rule
  itself.
