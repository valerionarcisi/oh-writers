# AI Cost Audit — margin & Mistral (EU) migration analysis

> **Status**: audit / decision-support. This is **not** a spec and it does **not**
> change any product invariant. It inventories where Oh Writers spends on the
> model, models the cost, and evaluates moving part of the workload to Mistral
> (EU) for margin **and** data residency. No migration is implemented here — the
> deliverable is the data and a phased recommendation.
>
> Pricing is per **1M tokens (USD)** and was verified in June 2026; re-verify at
> the provider pages before acting (the cost-smoke script below pins the same
> table as its source of truth).

---

## TL;DR

1. **The dominant cost is the Cesare agentic loop** (`cesare.server.ts`), not the
   one-shot helpers. It runs multi-turn, with large cached context and tool
   loops, on the Haiku/Sonnet router. Optimise here first; everything else is
   rounding error by comparison.
2. **Two quick wins are provider-independent** (do them regardless of Mistral):
   stale model ids in the breakdown path, and no single source of truth for
   model ids. See [Findings](#findings).
3. **Mistral is a real margin + privacy lever**, but only for the *right* calls.
   Move the **cheap, structured, one-shot** calls (normalise, rank, classify,
   summary, polish) first — they are low-risk and where Mistral's price gap is
   pure savings. Keep the **tool-heavy Cesare mutation tier on Claude** until a
   real tool-call success-rate comparison says otherwise (the agentic loop is
   where a weaker model damages user data, not just prose).
4. **EU/privacy**: Mistral is EU-domiciled (France), which materially simplifies
   the GDPR data-residency story vs a US processor. This is an argument for
   Mistral *independent of cost* — see [Privacy & EU](#privacy--eu-residency).

---

## AI call-site inventory

Every model call in the app, what it runs on today, and its cost shape. "Freq"
is the operative cost driver, not raw call count.

| # | Call site | Model today | Tier | Caching | Freq / cost shape |
|---|---|---|---|---|---|
| 1 | `predictions/cesare.server.ts` (main agentic loop, streamed) | Haiku 4.5 / **Sonnet 4.6** via `routeModel` | both | ✅ ephemeral on static system blocks | **Dominant.** Multi-turn, big context, tool loops. Every user edit. |
| 2 | `predictions/cesare-intent-classifier.ts` | Haiku 4.5 | low | partial | 1 short call per turn — cheap but ubiquitous |
| 3 | `predictions/cesare-screenplay-tools.ts` (`REVISION_MODEL`) | Haiku 4.5 | low | — | per screenplay revision tool call |
| 4 | `predictions/cesare-tools.ts` (`EXPAND_SECTION_MODEL`) | Haiku 4.5 | low | — | per "expand section" tool call |
| 5 | `predictions/bible-distill.effect.ts` | **Sonnet 4.6** | high | writes cache | **One-time per project** (distilled, then cached/reused) |
| 6 | `predictions/scene-summary.*` | Haiku 4.5 | low | — | per scene summary |
| 7 | `locations/server/normalise.server.ts` | Haiku 4.5 | low | — | one-time per project (persisted) |
| 8 | `locations/server/rank.server.ts` | Haiku 4.5 | low | — | per scene/location ranking |
| 9 | `documents/server/narrative-polish.server.ts` | Haiku 4.5 (`DEFAULT_MODEL`) | low | — | per polish action |
| 10 | `screenplay-editor/server/screenplay-polish.server.ts` | Haiku 4.5 | low | — | per polish action |
| 11 | `shooting-plan/server/blocking.server.ts` | Haiku 4.5 | low | — | per blocking suggestion |
| 12 | `breakdown/lib/llm-spoglio-prompt.ts` | ⚠️ **Sonnet 4 (`claude-sonnet-4-20250514`) + Haiku 3.5 (`claude-haiku-3-5-20241022`)** | both | streamed (raw SDK) | per breakdown extraction — **stale model generation, see F1** |

**Transport**: most calls go through the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`,
`callHaiku` → `generateText`). The Cesare stream and the breakdown spoglio use the
**raw `@anthropic-ai/sdk`** directly (streaming + `messages.stream`). This split
matters for migration cost — see [Technical effort](#technical-effort--risk).

---

## Findings

### F1 — Stale model ids in the breakdown path (provider-independent)
`breakdown/lib/llm-spoglio-prompt.ts` pins `claude-sonnet-4-20250514` and
`claude-haiku-3-5-20241022` — a **previous generation** vs the 4.5/4.6 used
everywhere else. Either this is a deliberate cost choice (then document it) or a
forgotten upgrade (then fix it). Today it is silent drift: the breakdown spoglio
runs on different — and differently-priced — models than the rest of the app,
and nobody decided that on purpose.

### F2 — No single source of truth for model ids (DRY violation)
`claude-*` ids are hardcoded in **7+ files** (`cesare-model-router.ts`,
`anthropic-client.ts` `DEFAULT_MODEL`, `bible-distill.effect.ts`,
`cesare-screenplay-tools.ts`, `cesare-tools.ts`, `llm-spoglio-prompt.ts`, plus
each `cost-smoke-*.ts`). Per [code-philosophy](conventions/code-philosophy.md)
this should be **one** `models.ts` catalogue (tier → id, with price metadata).
Without it, any audit, price re-check, or provider swap is an error-prone
find-and-replace — exactly the friction this audit hit. **This is the
prerequisite for any provider migration**: you cannot cleanly route a subset of
calls to Mistral while ids live in 7 places.

### F3 — Cost telemetry is ad-hoc, not aggregated
Langfuse traces exist (`aiTelemetry`), and there are six `cost-smoke-*` scripts,
but there is no rolled-up per-feature cost view. The smoke scripts are the only
way to get real token numbers, and they only cover Anthropic. The new
[compare script](#getting-real-numbers) extends them to multiple providers so
the Mistral decision rests on measured tokens, not vendor benchmarks.

---

## Cost model

Parametric, so it survives price changes. Cost of a call:

```
cost = (input_tokens      × price.input
      + cached_read_tokens × price.cachedRead
      + cached_write_tokens× price.cachedWrite
      + output_tokens      × price.output) / 1e6
```

### Pricing table (USD / 1M tokens, June 2026 — re-verify before acting)

| Model | Input | Cached read | Cached write | Output | Domicile |
|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 3.00 | 0.30 | 3.75 | 15.00 | US |
| Claude Haiku 4.5 | 1.00 | 0.08 | 1.25 | 5.00 | US |
| **Mistral Large 3** | 0.50 | — | — | 1.50 | **EU (FR)** |
| **Mistral Small** | 0.20 | — | — | ~0.60 | **EU (FR)** |
| *DeepSeek V3 (ref.)* | ~0.14–0.23 | — | — | ~0.28–0.34 | CN |
| *Gemini 3 Flash (ref.)* | 0.50 | — | — | 3.00 | US |

> Mistral has no Anthropic-style ephemeral prompt-cache tier, so its column has
> no cached read/write discount. **This is the catch**: on calls dominated by a
> large *cached* prefix (Cesare with the film bible cached), Haiku-with-cache can
> beat Mistral-without-cache. On calls dominated by *fresh* input + output
> (one-shot helpers), Mistral wins decisively. The cost model makes this explicit
> per call instead of assuming the headline per-token gap applies everywhere.

### Headline per-token gap (no caching)
Replacing **Haiku 4.5 → Mistral Large 3** on a fresh one-shot call:
`input 1.00→0.50 (−50%)`, `output 5.00→1.50 (−70%)`. **Mistral Small** is
`input −80%`, `output −88%` vs Haiku. The one-shot helpers (#6–#11) are mostly
short structured outputs → the output-token discount dominates → these are the
highest-ROI, lowest-risk calls to move.

---

## Mistral migration analysis

### Where it pays (move first — low risk)
Calls #6–#11 + the intent classifier (#2): one-shot, structured, short output,
no tool loop, no cache dependency. These are pure savings at Mistral Small/Large
prices, and a wrong answer is recoverable (re-run a summary; it does not corrupt
the open document). The breakdown spoglio (#12) is also a strong candidate once
F1 is resolved.

### Where to be careful (keep on Claude for now)
The Cesare **mutation tier** (#1 Sonnet path, #3, #4): these drive tool loops
that **apply live edits to the user's document** (the Agentic Edit invariant).
A weaker model here doesn't just write worse prose — it emits malformed tool
args or hallucinated tool names, i.e. *wrong mutations*. Do not move this tier
on a price argument alone; move it only if the [compare script](#getting-real-numbers)
shows Mistral Large 3's **tool-call success rate** is comparable on our actual
tool schemas. The Cesare **read/question tier** (Haiku path) is lower-risk and
can be A/B'd earlier.

### Privacy & EU residency
Independent of cost, Mistral is **EU-domiciled (France)**, which is a direct
argument for the product's GDPR posture: data-residency and a single-jurisdiction
processor story are simpler than with a US processor. Before relying on this:
confirm the **API DPA / data-residency terms** and the **no-training-on-API-data**
default in writing, and record the conclusion here. The user-facing benefit
(EU data handling) is real and worth stating in the product's privacy copy if
confirmed — but verify the contract, don't assume it from domicile.

### Technical effort & risk
- **Low effort**: the one-shot helpers go through `callHaiku` → AI SDK. Adding a
  Mistral provider (`@ai-sdk/mistral`, or an OpenAI-compatible endpoint) and
  routing by a model id resolved from the F2 catalogue is a contained change.
- **Higher effort**: the **raw `@anthropic-ai/sdk` streaming path** in
  `cesare.server.ts` and the breakdown spoglio must be rewritten to talk to
  another provider **while preserving the Tracer invariant** (every turn must
  still stream `reading → reasoning → writing → tool → done`). This is the
  expensive, risky part — another reason to keep Cesare's mutation tier on Claude
  in phase 1.
- **Lost optimisation**: Anthropic ephemeral prompt caching does not port. Re-run
  the cost model *without* the cache discount for any call you move off Claude.

---

## Recommendation (phased)

1. **Phase 0 — quick wins, no provider change.** Fix F1 (decide & pin breakdown
   models), then F2 (single `models.ts` catalogue with price metadata). This
   alone removes silent drift and is the prerequisite for any routing-by-provider.
2. **Phase 1 — measure.** Run `pnpm cost:smoke:provider-compare` with both keys
   set to get **real tokens + cost + tool-call success** on our prompts (not
   vendor benchmarks). Fill the results table below.
3. **Phase 2 — move the safe calls.** Route the one-shot helpers (#2, #6–#12) to
   Mistral Small/Large behind the catalogue. Keep Cesare's mutation tier on Claude.
4. **Phase 3 — re-evaluate Cesare.** Only if Phase 1 shows comparable tool-call
   reliability for Mistral Large 3 on our tool schemas, pilot the Cesare
   read/question tier, then the mutation tier. This needs a spec — it touches the
   Agentic Edit invariant and the streaming transport.

---

## How to decide if Mistral is right (rubric)

The paper "−80%" is **not** a decision number — it is Mistral *Small* vs Haiku on
raw per-token list price. The real answer needs three measurements, on our own
prompts, at the tier we'd actually deploy. Decide per call category, not globally.

### 1. Cost — measure, don't quote the headline
- Quality-sensitive generation would run on **Mistral Large 3** (−50% input /
  −70% output vs Haiku), not Small — so the realistic gap is smaller than −80%.
- We **lose Anthropic prompt caching** (−90% on cached input). On Cesare, the
  cached film-bible prefix makes Haiku's *effective* input far below list, which
  narrows the gap further.
- ✅ **Go signal**: measured cost on real-shaped context (cache included on the
  Anthropic side) is materially lower — target **≥ 30% saving on the moved
  category** to be worth the migration + maintenance cost. Below that, the EU/
  privacy argument has to carry the decision on its own.

### 2. Quality — read the outputs, blind
Benchmarks don't transfer to "good Italian screenwriting prose". The compare
script now emits **side-by-side outputs** for the same prompt and includes two
realistic quality tasks (scene summary + logline polish). Method:
- Read Claude vs Mistral answers to the identical prompt; ideally hide which is
  which. Score on: correct Italian, caught the subtext, right length/format, no
  hallucinated content.
- Do it at the **tier you'll deploy** (judging Large when you'll ship Small
  overstates quality).
- Optional scale-up: an LLM-as-judge pass (have Claude grade both answers) to
  rank many samples fast — useful, but spot-check by hand for judge bias.
- ✅ **Go signal**: Mistral is "indistinguishable or better" on the blind read
  for that task category. ❌ **No-go**: it drops the subtext, drifts to English,
  or needs a longer prompt to match — the prompt-engineering tax erodes the saving.

### 3. Tool reliability — the gate for Cesare's mutation tier
The function-calling probe reports ✅/❌ per provider. For the mutation tier this
is the **hard gate**, not a tie-breaker: a malformed/hallucinated tool call is a
*wrong edit to the user's document*.
- ✅ **Go signal**: tool-call success is on par with Claude across repeated runs
  on our real tool schemas. Anything below that → keep the mutation tier on Claude.

### Decision, per category
| Category | Cost gate | Quality gate | Tool gate | Default |
|---|---|---|---|---|
| One-shot helpers (#2,#6–#12) | ≥30% saving | blind read OK | n/a | **Move to Mistral** if gates pass |
| Cesare read/question tier | ≥30% saving | blind read OK | probe OK | Pilot after helpers |
| Cesare mutation tier (#1,#3,#4) | secondary | blind read OK | **on par required** | **Stay on Claude** until proven |

## Getting real numbers

`scripts/cost-smoke-provider-compare.ts` (run: `pnpm cost:smoke:provider-compare`)
runs the same scenarios against **Anthropic and Mistral side by side** and emits
a Markdown report with, for each prompt:
- per-turn **tokens + cost** (cost gate, §1),
- **side-by-side outputs** so you can blind-read quality (quality gate, §2) —
  includes two realistic tasks (scene summary + logline polish),
- a **function-calling probe** (✅/❌) (tool gate, §3).

It reuses the production `routeModel` so it can't drift from live routing, pins
the pricing table above as its single source of truth, and **skips any provider
whose API key is absent** (set `ANTHROPIC_API_KEY` and/or `MISTRAL_API_KEY`). It
is **not** a CI job — run ad-hoc.

### Results (fill after first run)

| Scenario | Provider/model | Input | Output | Cost | Tool-call OK? |
|---|---|---|---|---|---|
| _pending first run_ | | | | | |

**Projected monthly margin delta** (fill from the run): _pending_.
