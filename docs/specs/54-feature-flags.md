# Spec 54 — Feature Flags (market · plan · user)

Status: **Planned** · 2026-06-02. Built alongside i18n ([Spec 18b](core/18b-i18n-implementation.md));
the language(market) gate is its first and only operative consumer at launch.

## Strategy (decided)

1. **Catalogue every gateable feature now, all enabled by default.** The full surface is
   registered so the framework is complete and future-proof, but nothing is blocked at launch
   (`plan` is permissive — no billing yet; no user toggles wired yet).
2. **Language is the operative switch.** When a user is on the **EN locale** (international /
   European market) the Italy-only features are **detached**. Today that's exactly two:
   **SIAE export** and **bandi/fundraising (Opportunità)**. Everything else is universal and stays on.

So `market` (derived from locale) is the only source that actually cuts a feature right now;
`plan` and `user` are designed-for but inert until billing / a settings toggle land.

## Decisions

- **OFF = hidden, always.** No upsell, no three-card-monte. `FeatureState` is a boolean: a disabled
  feature simply disappears (no nav entry, no menu item, route redirects). Minimal cognitive load.
- **First source to say NO wins**, market → plan → user. Today only `market` ever says NO.
- **Resolved server-side** in the loader, serialised into the SSR payload (same discipline as locale
  in Spec 18b) so SSR / first paint / route guards are correct and there's no flash.
- **Deep module / narrow interface.** All gating lives in one pure resolver in domain; consumers get
  a boolean via `useFeature(...)` and never learn *why*.

## Catalogue (`packages/domain/src/features/`)

```ts
export const Features = {
  // Narrative
  SOGGETTO: "soggetto",
  SYNOPSIS: "synopsis",
  OUTLINE: "outline",
  TREATMENT: "treatment",
  SCREENPLAY: "screenplay",
  // Production
  BREAKDOWN: "breakdown",
  BUDGET: "budget",
  SCHEDULE: "schedule",
  LOCATIONS: "locations",
  SHOOTING_PLAN: "shootingPlan",
  // Cross-cutting
  CESARE: "cesare",
  // Italy-only (cut on EN)
  SIAE_EXPORT: "siaeExport",
  FUNDRAISING: "fundraising",
} as const;
export type Feature = (typeof Features)[keyof typeof Features];

export interface FeatureContext {
  market: Market; // marketFromLocale(locale): "it" | "intl"
  plan: Plan; // permissive default until billing (Spec 16-core)
  userDisabled?: ReadonlySet<Feature>; // designed-for; unwired until the settings toggle ships
}

export const resolveFeatures = (ctx: FeatureContext): ReadonlySet<Feature> => { … };
export const isFeatureEnabled = (f: Feature, ctx: FeatureContext): boolean =>
  resolveFeatures(ctx).has(f);
```

**Rules at launch:**
- `siaeExport`, `fundraising` → require `market === "it"`. (The only features that ever turn OFF today.)
- Every other feature → **always enabled** (universal). `plan`/`userDisabled` are consulted by the
  resolver but never exclude anything yet — the call sites are correct so enforcement is a data
  change later, not a code change.

`Plan` is a tagged const with a permissive default; real subscriptions arrive in Spec 16-core.

## Web (`apps/web/app/features/feature-flags/`)

- `FeatureProvider` — fed the server-resolved enabled set via loader data.
- `useFeature(feature): boolean`, `useFeatures(): ReadonlySet<Feature>`.
- The loader builds `FeatureContext` (market from the user's locale; plan permissive) and calls
  `resolveFeatures`; the result rides in loader data next to locale.

## Consumers at launch (the two IT-only cuts)

- **SIAE export** (`routes/_app.projects.$id_.soggetto.tsx`): the "Esporta SIAE" ActionsMenu item is
  included only when `useFeature("siaeExport")`.
- **Fundraising/Opportunità**: the nav entry (`Sidebar.tsx` ~line 244) renders only when
  `useFeature("fundraising")`; the route (`routes/_app.projects.$id_.opportunities.tsx`) `beforeLoad`
  redirects to the project home when disabled (server-side, no flash).

All other nav features + Cesare ask `useFeature(...)` too (so the wiring is uniform and future
plan/user gating is a no-op change), but resolve to `true` for everyone today.

## Tests

- Domain unit: `resolveFeatures` truth table — `intl` excludes `siaeExport`+`fundraising` and nothing
  else; `it` includes everything; every non-IT feature enabled in both markets; precedence (market NO
  wins). Plus `userDisabled` removes a feature when populated (forward-test).
- E2E (i18n EN fixture): SIAE menu item absent + Opportunità nav absent + `/opportunities` redirects in
  EN; all present in IT. (Same suite as the i18n market-gate tests, Spec 18b PR-3.)

## Out of scope (now)

- Billing / real plans (Spec 16-core) — `plan` ships permissive; no feature is plan-gated yet.
- The user "disable Cesare" settings toggle + DB persistence — `userDisabled` is designed-for but
  unpopulated; the toggle UI is a later dedicated cycle.
- Upsell UX — explicitly rejected; OFF is always hidden.
