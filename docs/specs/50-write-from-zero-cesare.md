# Spec 50 — Write-from-zero with Cesare (guided mode + split-drawer chat)

Status: **Planned** · Decided 2026-05-30 · Build LAST — after the Spec 47 fleet gate, Spec 49 (routed SplitDrawer), AND Spec 48 (Effect-TS AI refactor). Build sequence: 47 → 49 → 48 → **50**.

## Context

The user wants to start a project from a single spunto and write the whole
narrative chain with Cesare — logline → soggetto → sinossi → scaletta →
trattamento → sceneggiatura — each generated/edited live, with full tracer
visibility.

**Cost decision (PO, 2026-05-30): NO dedicated wizard.** The agentic generation
is expensive — an auto-chained wizard could burn ~6 Anthropic calls per project
(several long: trattamento, sceneggiatura). So we do NOT build a separate guided
flow. Instead:

1. **Split-drawer Cesare chat** (light, near-done) — promote the floating Cesare
   into a routed column via the floating drawer's icon (A4's `↗` "Apri come
   colonna" + `?peek=cesare`).
2. **Next-step suggestion (one call per click)** — Cesare suggests the next
   narrative step when it makes sense, as a single button. The user generates
   ONE entity at a time, by choice. Never an automatic chain. Cost is per-click,
   user-controlled; there is no wizard to build or maintain.

The documents ARE the state — "progress" is simply which docs exist. There is no
separate entry point / onboarding flow to design: the suggestion surfaces inside
the normal Cesare chat on any page.

## Part 1 — Split-drawer Cesare chat (light, near-done)

- Icon on the floating drawer header (`↗` "Apri come colonna", A4) promotes the
  chat into the routed SplitDrawer (`?peek=cesare`, Spec 49 — deep-linkable).
- Same chat, same single source of truth (no duplicated container — A4 already
  unmounts the floating sheet when the split is active).
- From the column the user writes anything as today, in a dedicated lane while
  the page compresses on the left.
- Finalisation only: ensure the open/close is fully routed (Spec 49) and the
  icon is discoverable.

## Part 2 — Next-step suggestion (one call per click)

NO wizard, NO auto-chain, NO separate flow. Inside the normal Cesare chat (in the
split column or floating), when it makes sense Cesare offers the next narrative
step as a **single suggestion button**:

- The next step is derived from which documents already exist (the docs ARE the
  state): no logline → suggest writing a logline from the spunto; logline but no
  soggetto → suggest generating the soggetto from it; and so on up the chain
  (logline → soggetto → sinossi → scaletta → trattamento → sceneggiatura).
- The user clicks → **exactly one** generation runs, via the canonical Agentic
  Edit Pattern (auto-version before apply, live, Mostra/Nascondi, ↩ Annulla),
  using the cross-domain universal dispatch (A7) so the generator reads the
  upstream docs (e.g. scaletta from soggetto), with the streamed tracer always
  visible (`reading{upstream} → reasoning → writing{entity} → done`).
- **Never an automatic chain.** One entity per click, user-chosen. Cost is
  per-click and visible. The user can ignore the suggestion and type anything.
- A spunto is just the first user message — no dedicated onboarding screen. If
  the project is empty, the suggestion is "scrivi una logline dal tuo spunto".

This is a thin orchestration over existing entities + a suggestion affordance —
no parallel store, no state machine, no new generators (reuse `write_logline`
(A8) + the document-gen tools (A7)).

## Reuse (no new variants)

- Agentic Edit Pattern (CLAUDE.md) — every generate/edit step.
- Universal dispatch (Spec 47b / A7) — generators available cross-page.
- `write_logline` (A8) + document-gen tools — the per-entity generators.
- Streamed tracer (Spec 47a / A2) — always-visible step trace.
- Routed SplitDrawer (Spec 49) — the surface, deep-linkable.

## Tests (OHW-050)

- Part 1: floating → icon → routed split (`?peek=cesare`), page compresses,
  deep-link opens the split; close restores. Single chat container (no dup).
- Part 2: from a spunto, Cesare proposes a logline → accept → soggetto generated
  from it → … each step live + versioned + tracer visible + Annulla reverts.
  Resume: leave mid-chain, reopen, progress reflects the existing documents.
- Sad: empty spunto rejected; refusing a step leaves the chain stoppable.

## Build order (waves, LAST — after Spec 47 gate, Spec 49, and Spec 48 Effect)

- W1: Part 1 — finalise the routed split-drawer Cesare chat + icon (light).
- W2: Part 2 — guided chain orchestration (logline → … ), one step at a time,
  reusing the existing generators.
- Each wave: Design → QA → Lead judge, bounce-backs, user confirm.
- **Each wave ends with screenshots + video + report to the user.**

## Out of scope

- Replacing the per-entity editors — the guided mode orchestrates them, it does
  not rebuild them.
- A separate wizard persistence store — the documents are the state.
