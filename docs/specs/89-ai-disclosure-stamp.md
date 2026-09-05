# Spec 89 — AI disclosure stamp on exports

Status: **Done** (2026-09-05). Owner: Valerio.

Four decisions below were revised during implementation, against what's
actually built — see the inline notes: (1) screenplay placement is a PDF
footer stamp, not `titlePageDoc` front matter (afterwriting is an external
CLI, not a pdfkit call this repo controls); (2) backfill for screenplay/
schedule defaults to **not** touched, not "assume touched" — the maximum-
caution stance applies going forward, not retroactively to history with
zero signal (see the confirmed decision below); (3) breakdown got a new
`ever_ai_touched` column instead of the originally-planned reuse of
`breakdown_occurrences.source` (see Tracking coverage below); (4) schedule
tracking covers `move_scene_to_day`/`merge_days`/`swap_scenes`/
`suggest_reorder`, not `lock_day`/`unlock_day` (see Tracking coverage
below).

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
4. As a screenwriter, I want the note in my screenplay export to stay
   unobtrusive, not a watermark across the pages that clashes with the
   professional formatting producers expect — built as a small bottom-right
   footer (see the placement note under Implementation Decisions for why
   this isn't in the title page as originally planned).
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
  - **Breakdown — REVISED during implementation**: originally planned as a
    query over existing `breakdown_occurrences.source` with no schema
    change. Built instead with a new `breakdown_elements.ever_ai_touched`
    column, backfilled from existing `source = "cesare"` rows. Reason:
    `source` lives on the occurrence (a single detection event), not the
    element, and is mutable data a future feature could legitimately
    rewrite (e.g. merging duplicate occurrences) — a permanence flag must
    not depend on a field whose only contract today is "current
    provenance," not "ever touched." The new column carries that
    permanence guarantee explicitly, the same shape as screenplay/
    schedule below, rather than reusing a field never designed to survive
    every future mutation of the occurrences table.
  - **Screenplay** — gap. `screenplay_versions` has no equivalent field
    today. Add one, mirroring `document_versions.cesareSessionId` in shape
    (nullable session reference), populated whenever a Cesare tool
    generates or edits a scene.
  - **Schedule/shooting plan** — gap. Neither `shooting_days` nor `strips`
    (or whatever the schedule schema's mutable unit is) has a provenance
    field. Added one flag on `schedules`, populated whenever a Cesare tool
    reorganizes the plan: `move_scene_to_day`, `merge_days`,
    `swap_scenes`, `suggest_reorder` (see `cesare-schedule-tools.ts`).
    **REVISED during implementation**: `lock_day`/`unlock_day` do NOT set
    the flag — they toggle a single boolean lock on a day, they don't
    reorganize anything a producer or 1st AD would read as "AI helped
    plan this," so they're excluded deliberately, not a missed case.

- **Backfill for pre-existing data — REVISED during implementation**:
  screenplay/schedule history that predates the new tracking fields has no
  way to know retroactively whether Cesare touched it. Decided against the
  "assume touched" stance originally proposed here: neither table ever had
  ANY AI-provenance signal before these columns existed (unlike breakdown's
  `source` or documents' `cesareSessionId`, both of which are backfillable
  from real historical data) — marking every pre-existing row as AI-touched
  would be a mass false positive across every screenplay/schedule ever
  written, not caution. Both new columns default `false` and are **not**
  backfilled; the cautious "any touch, ever, is permanent" rule applies only
  going forward, to every Cesare-mutation from the moment each column
  exists.

- **Placement, per export format**:
  - **Narrative docs (Soggetto SIAE/DOCX, combined Logline+Synopsis+
    Treatment PDF)** — the note is injected as a line near the existing
    front-matter metadata (author, draft date) — for the combined PDF and
    Soggetto DOCX this is written directly by the pdfkit/docx call this repo
    controls, not through `titlePageDoc`, since neither of these exports
    actually builds its cover from that ProseMirror doc (they construct
    their own title-page text/paragraphs already, pre-dating this spec).
  - **SIAE export** — same note, placed in the existing free-text deposit
    notes area of the SIAE PDF (the form already has a notes field; see
    `subject-export-siae.server.ts`).
  - **Screenplay PDF/DOCX — REVISED during implementation**: the spec
    originally called for injecting the note into `titlePageDoc`-derived
    front matter, matching narrative docs. Not built that way: the
    screenplay PDF is rendered by `afterwriting`, an external CLI invoked
    via `execFile` (`pdf-screenplay.ts`) — this repo has no pdfkit call to
    inject text into for this export, only a finished PDF buffer. Built
    instead as a **post-processing step**: `stamp-pdf-footer.ts` (new
    dependency `pdf-lib`, approved) draws a small bottom-right footer on
    every page of the already-rendered PDF, independent of
    `includeCoverPage` — the note is a property of the whole document, not
    of the cover page specifically, so it must survive a cover-less export
    too.
  - **Breakdown PDF/CSV** — no title page exists for this format. Placement:
    a header line on the PDF export, and a leading metadata row on the CSV
    export (both formats already have a "no distinction of source" gap this
    spec also closes by surfacing `breakdown_occurrences.source` in the
    export, so this note is a natural extension of that same pass).
  - **Schedule/shooting-plan PDF export** — header line, matching the
    breakdown PDF placement for consistency. CSV export gets the same
    leading-metadata-row treatment as breakdown's CSV.

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

## Definition of Done

Shipped across all four surfaces, each with unit + integration + E2E tests
(sad path, happy path, permanence; screenplay/schedule also have direct
plumbing coverage against the real Cesare tool call, not just a test-hook):

- Breakdown: `6ffca8de` (phase 1)
- Narrative documents: `3c4a24c0` (phase 2)
- Screenplay: `c2835fb0` (phase 3, adds `pdf-lib`)
- Schedule: `85366e90` (phase 4)
- Test-coverage gaps found by an independent review pass, closed:
  `9d477e9f` (permanence + real-tool plumbing for documents/screenplay),
  `de7c5123` (PDF export + permanence for schedule)
- Standards + Spec review pass, findings closed: `suggest_reorder` now
  marks the schedule touched (was silently missing), screenplay export now
  checks the FULL version history instead of only the active version (was
  a real permanence bug), the 3x-duplicated "mark breakdown element
  touched" block extracted into one shared helper, a dead unused module
  (`isAiTouched`/`everAiTouched` pure functions, never called once the
  breakdown column landed) deleted, one inconsistent dynamic import made
  static, and test tags renamed from `[Spec 89]` to `[OHW-148]` to match
  the repo's issue-tag convention

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
