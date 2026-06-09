# Spec 70 — PDF import: coordinate-based extraction + graded fallback (AI optional)

Status: **Planned** (2026-06-09). Builds on the in-progress coord work on
`feat/versions-delete-and-current` (`pdf-coords.server.ts`, `fountain-from-pdf-coords.ts`).
Glossary: _coord path_, _text path_, _AI path_.

## Why

A screenplay PDF encodes element type by horizontal **indentation** (scene flush-left,
action, dialogue indented, character cue centred, parenthetical). The original importer
used `pdf-parse`'s default text extraction, which **discards X indentation and blank
lines**, so the classifier had to guess action vs dialogue vs character vs parenthetical
and got ambiguous cases wrong (parentheticals tagged as characters, action absorbed as
dialogue, paragraphs split at page edges).

Measured truth (decisive): pdf-parse bundles pdfjs; a custom `pagerender` recovers per-line
min-X. On a clean digital PDF the X buckets are razor-sharp and classification becomes
**deterministic**:

| PDF                                   | X buckets (scene/action/dialogue/parenthetical/character)                              | Outcome today                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Non fa ridere (digital)               | 78 / 108 / 180 / 216 / 252                                                             | coord path → correct                                                      |
| Wolf of Wall Street (shooting script) | scene-num gutter 47 / action 126 / dialogue 198 / character 297 (+ header X90 to drop) | **rejected by gate → text path** (parsable, but we throw the coords away) |
| No Country (single column)            | everything X≈18                                                                        | rejected → text path                                                      |

So the coord path is correct when it fires, but it is **not universal**: a slightly
different-but-valid layout (Wolf's left scene-number gutter, 5 levels) trips the
confidence gate and falls back to heuristics, and a genuinely flat extraction (No Country)
has no usable coordinates at all.

## Goal

Make import **universal** via a **graded strategy chain with graceful fallback**, where
the AI strategy is **strictly optional** (a project that disables AI must still get a
working import from the deterministic strategies):

```
import(PDF)
  Strategy 1 — coordinate extraction (deterministic, no AI)
      covers digital PDFs incl. shooting scripts (Non fa ridere, Wolf)
  Strategy 2 — text heuristics (deterministic, no AI)  ← current fountain-from-pdf
      covers PDFs whose coordinates are unusable (No Country, scanned-to-text)
  Strategy 3 — AI classifier (OPTIONAL, behind a feature flag)
      covers the long tail (odd layouts, low-confidence) ONLY when enabled
```

Without AI: 1 → 2 (today, but with a stronger 1). With AI: 1 → 2 → 3.

## Scope

### 1. Robust coordinate bucketing (the bulk of the value, no AI)

Generalise `deriveBuckets` so it covers more real digital layouts, NOT just the canonical
5-column one:

- **Scene-number gutters.** Recognise a left gutter where lines begin with a scene number
  fused to a heading (`1INSERT - TV COMMERCIAL`, `1AWE SEE ...`) or a right gutter of bare
  numbers. Strip the gutter number (capture it as the `#N#` forced scene number) and
  classify the line by the TEXT body's X, not the gutter X.
- **Header/footer rows.** Drop running headers / revision-page banners (Wolf's X90
  "Buff Revised Pages", "Script provided for educational…") and page numbers by position
  - content, not by guessing.
- **Adaptive levels, margin-normalised.** Cluster body X, normalise to the page's left
  margin, and map the ordered levels to scene < action < dialogue < parenthetical <
  character. Tolerate 4–6 levels. Keep the confidence gate but **loosen it to accept
  Wolf** (the gate must pass Wolf and Non fa ridere, still reject the flat No Country).
- Target: Wolf parses correctly through the coord path (GENE HACKMAN/JORDAN as character
  cues, dialogue indented, scene headings with `#N#`), verified against its rendered
  pages and existing text-path expectations.

### 2. Strategy chain + confidence (deterministic core)

- A single `resolveFountain` orchestrator in `pdf-import.server.ts` runs the strategies
  in order; each returns either a result **with a confidence/decision** or "decline".
- Coord path declines when buckets aren't confidently a screenplay (flat / scattered).
- Text path is the always-available deterministic floor.
- The chain is pure/deterministic up to here — **no network, no AI** — so an
  AI-disabled deployment is fully served.

### 3. AI classifier strategy (optional, flagged)

- New gateable feature in the flags catalogue (`packages/domain/src/features/flags.ts`),
  e.g. `Features.PdfImportAiAssist`, resolved server-side, **OFF by default**, OFF=hidden
  (per CLAUDE.md feature-flag rule + Spec 54).
- When ON **and** the deterministic strategies returned low confidence, send the raw
  extracted lines (with X hints when available) to Claude and ask for an element
  classification (scene/action/character/dialogue/parenthetical/transition per line).
  Map the result into the same Fountain dialect the rest of the pipeline consumes.
- Must obey the existing AI conventions: Anthropic key server-only, Langfuse trace,
  **MOCK_AI mock** for tests/dev, and a **cost-smoke test** (mandatory per QA policy).
- The Cesare **tracer invariant does not apply** here (this is a one-shot server
  transform, not a Cesare turn) — but it must still log a structured metric/trace.
- Hard rule: if the flag is OFF, the AI code path is never reached; import still works.

## Non-goals

- OCR for image-only/scanned PDFs (no text layer at all). Separate future spec.
- Re-flowing pagination or preserving exact visual line breaks — we reconstruct logical
  elements; the editor re-paginates.

## Round-trip contract (the acceptance test)

Per the owner: **import → the editor must match the PDF → export must match.** Validate:

- Element-by-element golden test of Non fa ridere page 2 (already exists) stays green.
- New golden for Wolf page 1–2 via the coord path (character cues + dialogue + scene `#N#`).
- Editor↔export idempotency: `docToFountain(fountainToDoc(X))` is stable on a second pass
  (already verified true after the first import normalises to standard Fountain).

## Tests (per layer, E2E-first per DoD)

- Unit: bucket derivation on Non fa ridere / Wolf / No Country (pass/pass/reject); gutter
  scene-number stripping; header/footer drop; confidence gate.
- Unit: `resolveFountain` strategy selection (coord → text → AI), with AI flag OFF vs ON.
- Mock-AI unit: AI strategy maps a classification to Fountain; cost-smoke stays in budget.
- E2E (OHW-070): import Non fa ridere → editor shows correct elements; import Wolf →
  correct; import No Country → still works via text path. (Needs the import E2E suite in
  CI — currently blocked by N-31; track together.)

## Open questions

- Confidence metric shape: a single 0–1 score per strategy, or per-strategy boolean +
  ordering? Lean to a small score so strategy 3 only triggers below a threshold.
- Where exactly the gutter-number capture feeds the `#N#` forced-scene-number syntax
  (reuse the existing `extractLeadingSceneNumber` / forced-number path).

## Related

- BUG-N42/N43/N44/N50/N51 (the import-quality bugs this supersedes the root cause of).
- Spec 54 (feature flags) — the AI strategy is gated through it.
- [[project_ai_features]], [[feedback_qa_policy]] (cost smoke, mock-AI), [[project_feature_flags]].
- N-31 test debt (import E2E not in CI).
