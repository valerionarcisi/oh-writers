# Spec 87 — EU AI Act compliance baseline

Status: **Superseded** (2026-09-04). Owner: Valerio.

## What superseded it

This spec's original items 1 and 2 were written as a cautious first pass
without checking the Regulation's primary text directly (no EUR-Lex citation
in the original version below). A proper research pass against the Official
Journal text (Regulation (EU) 2024/1689, EUR-Lex CELEX 32024R1689) reached
the opposite conclusion for Cesare's actual usage pattern — see
[`docs/research/2026-09-04-eu-ai-act-article-50-cesare.md`](../research/2026-09-04-eu-ai-act-article-50-cesare.md),
tracked as GitHub issue
[#147](https://github.com/valerionarcisi/oh-writers/issues/147) (closed).

- **Item 1 (explicit AI disclosure, Art. 50(1))**: not required. Cesare is a
  panel the account owner opens by name, not the "unknowing third party"
  scenario Art. 50(1) targets — and even under an extensive reading, the
  "obvious from context" exemption is already satisfied by the visible
  "Cesare" branding across every surface.
- **Item 2 (AI-generated content marking, Art. 50(4))**: not required either.
  Documents stay private inside the writer's project and are never published
  by the tool itself — the article's threshold ("published... to inform the
  public on matters of public interest") never triggers. Even if it did, the
  human-review/editorial-control exemption is already met by the existing
  auto-version-before-AI-edit flow.

That said, item 2's underlying idea — a visible marker on exports touched by
Cesare — survives as a **proactive product decision, not a legal
requirement**: Valerio wants to avoid friction with producers/festivals as
industry AI-disclosure norms tighten, even where the law doesn't require it
yet. This is now tracked as its own feature, **"AI disclosure stamp"**, in
[#148](https://github.com/valerionarcisi/oh-writers/issues/148), with its own
scope (trigger: any Cesare touch in a document's history → permanent stamp;
covers narrative docs, screenplay, breakdown, and schedule exports) decided
in a separate grilling session. Do not re-derive scope here — #148 owns it.

- **Items 3, 4, 5** (human-oversight documentation, data-minimization audit
  on `assemble-system-prompt.ts`, Langfuse logging/traceability
  verification) are unaffected by the Art. 50 reading above — they don't
  depend on it. None of them involves a hard-to-reverse decision, so they
  don't warrant staying as spec items; each became its own lightweight
  GitHub issue instead:
  - Human-oversight documentation: [#149](https://github.com/valerionarcisi/oh-writers/issues/149)
  - Data-minimization audit: [#150](https://github.com/valerionarcisi/oh-writers/issues/150)
  - Logging/traceability verification: [#151](https://github.com/valerionarcisi/oh-writers/issues/151)

## Original spec (kept for history, no longer the plan)

<details>
<summary>Original content, 2026-09-02</summary>

Status was: **Planned**. Owner: Valerio (legal/classification items are his
call, not Claude's — flagged below).

### Context

Oh Writers embeds an AI agent (Cesare) that reads and writes user documents.
The EU AI Act's transparency obligation (Art. 50 — in force since 2026-08)
applies regardless of the product's risk tier: a user interacting with an AI
system must be told so. This is a product invariant gap today — no code in
`features/ai-providers` or the Cesare shell renders an explicit "you are
talking to an AI" disclosure; the UI relies on the "Cesare" branding implying
it.

This spec scopes only the items that are **code changes to this repo**.
Classification (Art. 6/Annex III risk tier), the internal AI-usage policy,
and the compliance deadline calendar are organizational decisions outside
what Claude can decide or implement — tracked here as open items for Valerio,
not designed.

### Decision — code-actionable items

1. **Explicit AI disclosure (Art. 50), in the Cesare drawer/session UI.**
   A persistent, unmissable string identifying Cesare as an AI system —
   not just the brand name — the first time a session opens and available at
   all times (e.g. in the composer placeholder or a header line). i18n
   catalogue entry (IT default, EN), not a literal string. This is the one
   item with a hard-ish external deadline; treat as **NOW**, not backlog.
2. **AI-generated content marking.** Any exported/published artifact
   (PDF/DOCX export, SIAE export) that contains Cesare-authored or
   Cesare-edited text carries a marker that the content was AI-assisted. Scope
   to confirm: does this apply to a full document that a human then edits, or
   only to unreviewed Cesare output? — needs a decision before implementation,
   not assumed.
3. **Human oversight is already the product invariant** (Agentic Edit Pattern,
   CLAUDE.md): every Cesare mutation auto-versions before applying and is
   revertible via Versions. This spec does not change that; it documents that
   it already satisfies the Art. 14-style human-oversight expectation and
   should be cited as such rather than re-built.
4. **Data sent to the model.** Audit what Cesare's context-assembly
   (`context/assemble-system-prompt.ts` and callers) sends to Anthropic when a
   screenplay/document contains real names of third parties (actors, real
   locations, real people referenced in a script). No code decision yet —
   this is a data-minimization review, output is a written finding, not
   necessarily a code change.
5. **AI interaction logging.** Confirm current Langfuse traces
   (`docs/conventions/observability.md`) already retain enough to satisfy a
   traceability request, and for how long. Verification task, not new
   logging infra, unless the audit finds a gap.

### Explicitly not this spec (Valerio's call, not code)

- Risk-tier classification of the product under Annex III.
- Anthropic's own GPAI-provider conformity (their obligation, not ours to
  build — only to record which model/version is in use, which item 2 in the
  registry below already implies).
- Internal AI-usage policy document, privacy-notice wording, compliance
  deadline tracking.

### Domain & files

- `apps/web/app/features/ai-providers/` — disclosure string, AI-content
  marker on export.
- `packages/domain/src/i18n/` (or wherever the translation catalogue lives) —
  new keys, IT + EN.
- `apps/web/app/context/assemble-system-prompt.ts` — data-minimization audit
  target (read-only review first).

### Tests (OHW-086)

- `tests/ai-disclosure.spec.ts` — opening a Cesare session (peek and full
  route) renders the AI-disclosure string; present in both IT and EN locales.
- `tests/ai-content-export-marker.spec.ts` — once the marking scope from
  decision 2 is settled: an export containing Cesare-touched content carries
  the marker; a fully human-authored doc does not (sad path — no false
  positive).

### Definition of Done

Disclosure string live + E2E green · export marker shipped once scope is
decided (may split into a follow-up spec if the scope answer is non-trivial)
· data-minimization finding written up (even if "no change needed") ·
`docs/BACKLOG.md` updated · this spec updated to record the classification
decision once Valerio makes it.

</details>
