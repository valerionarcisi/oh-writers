# Spec 24 — Cascading pre-fill

> Status: draft · Date: 2026-05-15 · Owner: Valerio
> Driven by: UI audit 15 May 2026 — user request "tutte le parti devono essere precompilate man mano che uno usa ste cose". Tracks the deferred items C.1–C.6 from the same audit.

---

## 1. Problem

Every downstream feature currently requires an explicit "Genera" / "Rigenera" / "Ri-spogliare" button. The user expects each module to *auto-populate from upstream as soon as enough information exists*:

- Create project → title page, default budget skeleton, default rate card, schedule shooting-day estimate all pre-filled
- Save Soggetto → Logline auto-extracted (already manual via "Estrai dal soggetto")
- Save Synopsis → Outline acts/scenes suggested
- Save Screenplay → Breakdown auto-spoglio incremental
- Stable Breakdown → Budget lines auto-generated
- Stable Schedule → Budget day costs auto-update

The current model treats each "Genera" as a manual operation; the spec proposes flipping it so explicit triggers become *overrides*, not the primary path.

## 2. Decision model — `stale-then-refresh`

Every derived entity gets a `staleAt: timestamp | null` column on its row. Source mutations bump the dependent's `staleAt`. A read of a stale derived entity triggers regeneration on the next access. The UI shows an inline "Aggiornamento…" indicator without blocking the view.

```
project.format change   ──┐
project.genre  change   ──┴── set rateCard.staleAt = now()
soggetto.content change ──┐
                          ├── set logline.staleAt = now()
synopsis.content change ──┘

screenplay.content change ──── set breakdown.staleAt = now()
breakdown.stable          ──── set budget.staleAt = now()
schedule.stable           ──── set budget.staleAt = now()
```

A derived row is considered fresh when `generatedAt > staleAt`.

## 3. Cost & race control

Auto-regeneration is expensive (LLM, DB writes). Three guards:

1. **Debounce per source kind**: screenplay edits coalesce on 30s of idle before invalidating breakdown. Other sources (project meta) propagate immediately.
2. **Cancellation tokens**: every regen task carries a token tied to the source's current revision. If the source changes again mid-regen, the in-flight task is cancelled at the next checkpoint.
3. **Frequency cap**: max one regen per derived entity per minute. Subsequent stale flags collapse into the next window.

## 4. Implementation paths

### Path A (v1) — TanStack Query invalidation cascade
- Each `staleAt`-bumping server fn invalidates the dependent's query key on success.
- Downstream `queryOptions` includes a `select` that detects `staleAt > generatedAt` and fires the regen mutation as a side effect of the loader.
- Pro: small surface, no new infra.
- Con: regen runs in the user's tab; if the user closes before it finishes, the bump survives but no regen happened.

### Path B (v2) — Server-side worker
- A small queue (Postgres `LISTEN/NOTIFY` or pg-boss) drains stale rows in the background.
- Pro: regen survives tab close.
- Con: queue infra, retries, observability.

**Pick Path A for the first cut.** Path B is the obvious follow-up once we see the user behavior.

## 5. Scope (v1 — Path A)

1. Schema: add `staleAt: timestamp | null` to `budgets`, `breakdowns`, `schedules`, `documents (logline only)`.
2. Server fns: on every mutating source op, set the dependent's `staleAt = now()`.
3. Query options: include a "freshness selector" that, when stale, fires the regen server fn before returning.
4. UI: a thin `Pill` in the Viewbar right slot, "Aggiornamento…", visible while a regen is in flight. Shared component, single source of truth.
5. Override: every existing "Rigenera" stays — invoked manually it bypasses the freshness check and forces a regen.

## 6. Out of scope

- Server-side worker (Path B).
- Real-time push to collaborators (different concern — covered by Yjs).
- AI-cost dashboard or per-user caps. Track separately.

## 7. Deferred items absorbed by this spec

From audit 15 May 2026 section C:

- C.1 Auto-budget from project type → covered by "create-project → budget.staleAt + first /budget visit triggers regen with default rate card".
- C.2 Cast as a Per-categoria card → orthogonal (it's a backend aggregation fix), but the auto-regen propagates the new total without manual "Genera".
- C.3 TOTAL STIMATO not including Cast → same as C.2.

## 8. Done criteria

- New project visit `/budget` immediately shows a draft budget computed from format×genre rate card, no "Genera" CTA.
- Editing the screenplay flips the breakdown into a stale state; after the 30s debounce, the breakdown auto-refreshes; the budget follows.
- Manual "Rigenera" still works and forces an immediate regen regardless of staleness.
- A single "Aggiornamento…" pill exists in `@oh-writers/ui` and is used by every page that has a derived entity.

## 9. Open questions

1. Should the auto-regen run on first visit *every* time the user opens a stale page, or only when the staleness is "fresh enough" (e.g. <1h since the bump)? **Defer** — start with always-on-visit and tune.
2. Should the Soggetto's Logline auto-extract trigger on every save, or only when explicitly empty? **Start with: empty-only.** Once Logline has content, it's user-owned.
3. Does the breakdown debounce apply to typed characters or to autosaves? **Autosaves.** The breakdown read-side already runs against the saved screenplay content, not the in-memory PM doc.
