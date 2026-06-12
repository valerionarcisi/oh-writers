# Specs — when to write one (and when not to)

A spec is paid-for thinking: it costs time now to make a decision cheap to share and
hard to lose. Write one only when that trade is favourable. The driving criterion is
**reversibility**: the cost of a decision is the cost of undoing it. Cheap-to-reverse
work goes straight to code; expensive-to-reverse decisions get written down first.

## Write a spec (`docs/specs/NN-*.md`) when ANY of these holds

1. **A product invariant or cross-feature contract changes or is created** — e.g. the
   agentic-edit pattern, the auto-version policy, routed-surface arbitration. Anything
   CLAUDE.md or another spec would have to be updated for.
2. **The decision is expensive to reverse** — DB schema, server-function API shape, a
   new dependency, a pattern every feature will copy.
3. **Multiple agents or future sessions must share the same truth** — fleet contracts,
   deferred work that another session will pick up. Conversation state dies at `/clear`;
   the spec is the memory.
4. **New domain design** — a new feature whose domain model involves real choices
   (entities, ownership, boundaries), not just new screens on existing models.

## Do NOT write a spec for

- **Bug fixes** — the `docs/BUGS.md` entry (repro + proof + expected behaviour) IS the
  contract. Fix, test, update the entry. No spec, ever, unless the fix forces a
  contract change (then the spec is for the contract, not the bug).
- **Refactors with no behaviour change** — the tests are the contract.
- **Small reversible improvements** — UI polish, copy, a new button on an existing
  pattern. Tracer-bullet it: build, validate live, done.
- **Decisions without design** — a single choice with no moving parts gets one
  paragraph in the relevant existing doc (or an ADR if it must be findable), not a
  numbered spec.

## Keep specs light

- A spec earns its place by being read by agents and future sessions — write for that
  reader. Context in 3 lines, then the decision, the contract, and a Tests section
  (OHW-NNN tags, happy + sad paths). No prose padding, no future ideas (open a new
  spec instead).
- If during implementation reality diverges, update the spec to match what was built —
  a stale spec is worse than none.
- One page is the default; long is a smell that the design isn't settled.
