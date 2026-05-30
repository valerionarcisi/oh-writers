# Spec 50 — Write-from-zero with Cesare (guided mode + split-drawer chat)

Status: **Planned** · Decided 2026-05-30 · Build LAST — after the Spec 47 fleet gate, Spec 49 (routed SplitDrawer), AND Spec 48 (Effect-TS AI refactor). Build sequence: 47 → 49 → 48 → **50**.

## Context

The user wants to start a project from a single spunto and write the whole
narrative chain with Cesare — logline → soggetto → sinossi → scaletta →
trattamento → sceneggiatura — each generated/edited live, with full tracer
visibility. Decided to ship **both**:

1. **Split-drawer Cesare chat** (light) — promote the floating Cesare into a
   dedicated routed column via an icon on the floating drawer. Mostly already
   built: A4 added the `↗` "Apri come colonna" affordance + the `?peek=cesare`
   split lane; this just finalises it as the entry point and makes it routed per
   Spec 49.
2. **Guided "write-from-zero" mode** (new feature) — a step-by-step flow from a
   spunto through the full narrative chain.

These are two deliverables with different weight and timing.

## Part 1 — Split-drawer Cesare chat (light, near-done)

- Icon on the floating drawer header (`↗` "Apri come colonna", A4) promotes the
  chat into the routed SplitDrawer (`?peek=cesare`, Spec 49 — deep-linkable).
- Same chat, same single source of truth (no duplicated container — A4 already
  unmounts the floating sheet when the split is active).
- From the column the user writes anything as today, in a dedicated lane while
  the page compresses on the left.
- Finalisation only: ensure the open/close is fully routed (Spec 49) and the
  icon is discoverable.

## Part 2 — Guided "write-from-zero" mode (new feature)

A creation/onboarding flow. From an empty or new project:

1. User enters a **spunto** (free text: theme, premise, a few lines).
2. Cesare proposes a **logline** (live, versioned, tracer-visible). User accepts
   or asks to refine in chat.
3. Step advances to **soggetto**, generated from the accepted logline + spunto,
   then **sinossi**, **scaletta**, **trattamento**, **sceneggiatura** — each:
   - generated/edited LIVE via the canonical Agentic Edit Pattern
     (auto-version before apply, Mostra/Nascondi, ↩ Annulla),
   - using the cross-domain universal dispatch (A7) so each generator reads the
     upstream docs (e.g. scaletta from soggetto),
   - with the streamed step tracer always visible (CLAUDE.md invariant):
     `reading{upstream} → reasoning → writing{entity} → done`.
4. The user can stop at any step (not every project needs a full screenplay) and
   resume later — progress is the documents themselves, not a separate wizard
   state machine (the docs ARE the state).

### Surface

- Runs in the Cesare SplitDrawer (Part 1) so the just-written document is visible
  in the column beside/under the chat as it forms.
- A lightweight "chain" affordance (logline · soggetto · sinossi · scaletta ·
  trattamento · sceneggiatura) shows progress + lets the user jump.
- Each generated doc is a real document (versioned), reachable from its normal
  route — the guided mode is an orchestration over existing entities, NOT a
  parallel store. Reuse `write_logline` (A8) + the document-gen generators (A7).

### Open design questions (resolve before building Part 2)

- Is the chain a true wizard (linear, gated) or a free "suggested next step"
  (user can jump around)? Lean: suggested-next, since the docs are the state.
- Onboarding entry point: new-project flow, or an always-available "Scrivi da
  zero" action on any project?
- How much does each step auto-carry context forward vs ask the user.

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
