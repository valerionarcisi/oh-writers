# Spec 54 — Feature Flags (market · plan · user)

Status: **Planned** · 2026-06-02. Built alongside i18n ([Spec 18b](core/18b-i18n-implementation.md));
the i18n market-gating is its first consumer.

## Why

Three independent sources decide whether a feature is available, and we must not scatter
`if (locale==='it')` / `if (plan==='pro')` / `if (!user.cesareOff)` across the codebase:

1. **Market** — international (EN) hides Italy-only features (SIAE export, bandi/fundraising).
2. **Plan** — paid plans unlock features (e.g. Cesare). Billing doesn't exist yet (Spec 16-core),
   so the gate ships now with a permissive default and starts enforcing when billing lands.
3. **User preference** — the user can switch a feature off (e.g. disable Cesare). **Designed for
   now, wired later** — the resolver accepts the source but the settings UI + DB column come in a
   dedicated cycle.

One resolver answers "is this feature enabled?" Components ask `useFeature("cesare")` and never
learn *why* it's on or off.

## Decisions

- **OFF = hidden, always.** No "upsell" state, no three-card-monte. A disabled feature simply
  disappears (no nav entry, no menu item, route redirects). This keeps `FeatureState` a boolean,
  not a state machine — minimal cognitive load.
- **First source to say NO wins**, evaluated market → plan → user. Any NO ⇒ hidden.
- **Resolved server-side** in the loader and serialised into the SSR payload (same discipline as
  locale in Spec 18b) so SSR/first paint/route guards are correct and there's no flash.
- **Deep module / narrow interface.** All gating logic lives in one pure function in domain;
  consumers get a boolean.

## Model (domain — `packages/domain/src/features/`)

```ts
// The catalogue of gateable features (tagged const).
export const Features = {
  CESARE: "cesare",
  SIAE_EXPORT: "siaeExport",
  FUNDRAISING: "fundraising",
} as const;
export type Feature = (typeof Features)[keyof typeof Features];

// Inputs the resolver needs. `plan`/`userDisabled` are wired progressively.
export interface FeatureContext {
  market: Market; // from marketFromLocale(locale)
  plan: Plan; // today always the permissive default until billing exists
  userDisabled?: ReadonlySet<Feature>; // designed-for, unused until the settings toggle ships
}

// Returns the set of ENABLED features. First source to exclude wins.
export const resolveFeatures = (ctx: FeatureContext): ReadonlySet<Feature> => { … };
export const isFeatureEnabled = (feature: Feature, ctx: FeatureContext): boolean =>
  resolveFeatures(ctx).has(feature);
```

Gating rules (initial):
- `siaeExport`, `fundraising` → require `market === "it"`.
- `cesare` → market-agnostic; plan-gated once billing exists (today: enabled). User-toggle: honoured
  if present in `userDisabled` (today: never populated).

`Plan` is a tagged const (`free` | `pro` | `studio`, say) with a permissive resolver default
(`plan` treated as "everything included") until Spec 16-core wires real subscriptions — so the gate
is in place and call sites are correct, but nothing is blocked prematurely.

## Web (`apps/web/app/features/feature-flags/`)

- `FeatureProvider` — fed the server-resolved enabled set via loader data.
- `useFeature(feature): boolean`, `useFeatures(): ReadonlySet<Feature>`.
- Server: the loader builds `FeatureContext` (market from the user's locale, plan from the
  team/subscription once it exists) and calls `resolveFeatures`; the result rides in loader data
  alongside locale.

## Consumers (initial — the i18n market-gate, now via flags)

- Nav (`Sidebar.tsx`): the Opportunità entry renders only when `useFeature("fundraising")`.
- SIAE export (`routes/_app.projects.$id_.soggetto.tsx`): the menu item is included only when
  `useFeature("siaeExport")`.
- Opportunities route (`routes/_app.projects.$id_.opportunities.tsx`): `beforeLoad` redirects to
  the project home when `fundraising` is disabled (server-side, no flash).
- Cesare (future): the dock/drawer/sessions surfaces render only when `useFeature("cesare")` —
  wired when plan-gating or the user toggle ship.

## Tests

- Domain unit: `resolveFeatures` truth table — intl hides siae/fundraising; it shows them; cesare
  on by default; userDisabled removes a feature; precedence (market NO beats plan/user).
- E2E (with the i18n EN fixture): fundraising nav absent + `/opportunities` redirects + SIAE menu
  item absent in EN; all present in IT. (Same suite as the i18n market-gate tests.)

## Out of scope (now)

- Billing / real plans (Spec 16-core) — the `plan` source ships permissive.
- The user-facing "disable Cesare" settings toggle + its DB persistence — `userDisabled` is
  designed-for but unpopulated; the toggle UI is a later dedicated cycle.
- Upsell UX — explicitly rejected; OFF is always hidden.
