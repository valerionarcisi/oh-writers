# Full export audit — all 8 export points

Code-reading audit of every export server function in the repo, following up
on issue #180 (screenplay PDF page-size fix) and the SIAE/festival format
research (`2026-09-14-siae-export-festival-format-audit.md`). No browser/E2E
run performed here — findings are sourced from reading the server handlers,
their pipeline/builder modules, and existing test files directly.

## Summary table

| #   | Export point                        | File                                                   | Constraint              | Status             | Severity |
| --- | ----------------------------------- | ------------------------------------------------------ | ----------------------- | ------------------ | -------- |
| 1   | Screenplay PDF                      | `screenplay-editor/server/screenplay-export.server.ts` | External (festival)     | OK (fixed by #180) | —        |
| 2   | SIAE Soggetto PDF                   | `documents/server/subject-export-siae.server.ts`       | External (SIAE deposit) | **Gap**            | High     |
| 3   | SIAE Soggetto DOCX                  | `documents/server/subject-export-docx.server.ts`       | External (SIAE deposit) | **Gap**            | High     |
| 4   | Schedule (CSV+PDF)                  | `schedule/server/schedule-export.server.ts`            | Internal                | OK                 | —        |
| 5   | Locations (CSV)                     | `locations/server/locations-export.server.ts`          | Internal                | OK                 | —        |
| 6   | Breakdown (CSV+PDF)                 | `breakdown/server/export.server.ts`                    | Internal                | OK                 | —        |
| 7   | Shooting plan / shot list (CSV+PDF) | `shooting-plan/server/shooting-plan-export.server.ts`  | Internal                | **Gap**            | Medium   |
| 8   | Budget (CSV+PDF)                    | `budget/server/budget-export.server.ts`                | Internal                | OK                 | —        |

5 of 8 clean, 3 with real gaps (2 high, 1 medium).

## Gap 1 — SIAE PDF and DOCX are not the same document (High)

**Files**: `subject-export-siae.server.ts` (PDF) vs `subject-export-docx.server.ts` (DOCX)

These two exports are presented to the user as "the SIAE soggetto export" but
are structurally unrelated documents pulling from different data sources:

| Field            | PDF source                                                      | DOCX source                                                             |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Title            | `input.title` (freeform, typed in the export modal)             | `project.title`                                                         |
| Author           | `input.authors[]` (freeform name + optional CF, typed in modal) | `project.titlePageAuthor`, falling back to the **account owner's name** |
| Genre            | `input.declaredGenre` (modal)                                   | _(not present)_                                                         |
| Duration         | `input.estimatedDurationMinutes` (modal)                        | _(not present)_                                                         |
| Compilation date | `input.compilationDate` (modal)                                 | _(not present)_                                                         |
| Based-on         | _(not present)_                                                 | `project.titlePageBasedOn`                                              |
| Draft date       | _(not present)_                                                 | `project.titlePageDraftDate`                                            |
| Tax code (CF)    | `input.authors[].taxCode` (modal)                               | _(not present)_                                                         |

(`subject-export-siae.server.ts:36-82`, `subject-export-docx.server.ts:222-334`)

**Failure scenario**: a user opens the SIAE PDF export modal, types their name
and CF once for a deposit, then later exports the DOCX — the DOCX shows a
_different_ author (whatever `titlePageAuthor` or the account owner name is,
which may not match what was typed into the SIAE modal, especially on a team
project where the account owner isn't the credited author). Two "SIAE
soggetto" documents for the same project, silently disagreeing on who wrote
it — a real problem if both are ever submitted as part of the same
deposit/dossier, or if the DOCX is mistaken for a valid SIAE deposit sheet
(it has no genre/duration/CF at all, so it cannot function as one).

**Zero test coverage on either file** — no `subject-export-siae.test.ts` or
`subject-export-docx.test.ts` exists, so this divergence was never caught by
any layer.

Whether SIAE's own format mandate is loose (confirmed by the prior research —
no official page/font requirement for this deposit type) is irrelevant to
this finding: the gap is authorial/content consistency between two exports
of the _same underlying document_, not format compliance.

## Gap 2 — Shooting-plan / shot list has no version pinning (Medium)

**File**: `shooting-plan-export.server.ts:26-96` (`loadShotListData`)

```ts
const screenplay = await db.query.screenplays.findFirst({
  where: eq(screenplays.projectId, projectId),
  orderBy: (s, { desc }) => [desc(s.updatedAt)],
});
```

Unlike breakdown (`breakdown/server/export.server.ts:15-18`, which requires
an explicit `screenplayVersionId` in its input schema), the shot-list export
picks "whichever screenplay row was most recently updated" for the project,
with no `screenplayVersionId` parameter at all.

**Failure scenario**: a project with more than one screenplay (e.g. after an
import creates a second row, or in any future multi-screenplay flow) — if a
different screenplay for the same project was touched more recently than the
one currently open in the editor (even a stray autosave), the exported shot
list silently reflects scenes from the wrong screenplay. The scene numbers
and headings on the exported PDF/CSV would not match what the crew sees in
the app.

Secondary, lower-severity note: shooting-plan is the only one of the 5
internal exports with **no AI-disclosure note** — schedule, locations,
breakdown, and budget all stamp one when Cesare has touched the underlying
data (`schedule-export.server.ts:41-43`, `locations-export.server.ts:39-41`,
`export.server.ts:60-62`, `budget-export.server.ts:80-82`); shooting-plan has
no equivalent check anywhere in `shooting-plan-export.server.ts`. Inconsistent
with the pattern, not itself a correctness bug.

## Confirmed OK

- **Screenplay PDF** (#1): page-size fixed by #180; content sourced from the
  live active version, title page from `titlePageDoc` (WYSIWYG-correct).
- **Schedule** (#4): shares one `loadScheduleView` call for CSV and PDF,
  handles the no-schedule-yet case explicitly (empty CSV/PDF, no crash).
- **Locations** (#5): handles empty-requirements and empty-scenes cases
  explicitly; AI-disclosure aggregation is correct (`.some(...)`).
- **Breakdown** (#6): CSV and PDF share the identical row-mapping from one
  `getProjectBreakdownRows` call; `screenplayVersionId` is a required input,
  so the export is always pinned to one specific version — the correct
  pattern that shooting-plan (#7) should also follow.
- **Budget** (#8): the strongest of the five — `loadBudgetSections` is
  shared by CSV and PDF with an explicit code comment ("so a CSV, a PDF and
  the page can never report different money"), and proactively filters out
  a known breakdown data bug (slugline tokens misfiled as cast) so the
  export doesn't reproduce a bug the screen already fixed.

## Test coverage gaps (beyond content correctness)

- `subject-export-siae.server.ts` — **no test file at all**.
- `subject-export-docx.server.ts` — **no test file at all**.
- `breakdown/server/export.server.ts` — **no test file at all** (though its
  data loader `getProjectBreakdownRows` may be tested elsewhere — not
  checked in this pass).
- `schedule-export.server.ts`, `shooting-plan-export.server.ts`,
  `budget-export.server.ts` all have substantial existing test files
  (140/109/193 lines respectively) — not fully read line-by-line in this
  pass, but their existence is a meaningfully different risk posture than
  the three files above with zero coverage.

## Not fixed

Per instructions, nothing in this audit was fixed — this is a report only.
