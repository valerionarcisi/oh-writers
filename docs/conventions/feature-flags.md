# Feature Flags

Canonical spec: [54-feature-flags](../specs/54-feature-flags.md). This is the working rule.

## The rule

**Never gate a feature on a raw condition (`locale`, `plan`, market, a user pref) inline.**
A feature is shown/hidden through the **one** resolver in `@oh-writers/domain`:

```ts
import { resolveFeatures, Features, type FeatureContext } from "@oh-writers/domain";
```

- Domain: `resolveFeatures(ctx): ReadonlySet<Feature>` — the single source of truth. Sources are
  evaluated **market → plan → user**; the first to exclude wins. Pure, framework-agnostic, tested.
- Web: the loader builds the `FeatureContext` (market from the user's locale, plan from the
  subscription) **server-side**, calls `resolveFeatures`, and passes the enabled set into
  `FeatureProvider`. Components read a boolean via `useFeature(Features.X)` — and never learn *why*
  it's on or off.

## Hard points

- **Add every new gateable feature to the `Features` catalogue** in
  `packages/domain/src/features/flags.ts`. The catalogue is the complete surface; a feature that
  isn't in it can't be gated.
- **OFF = hidden, always.** No upsell, no disabled-but-visible state. A disabled feature has no nav
  entry, no menu item, and its route `beforeLoad`-redirects. `useFeature` returns a boolean — there
  is deliberately no `"upsell"` state.
- **Resolve server-side** (in the loader, serialised into the SSR payload) so SSR / first paint /
  route guards are correct and there is no flash. Never resolve features only on the client.
- **Components ask `useFeature(...)`, never the locale/plan directly.** If you find yourself writing
  `if (locale === "it")` or `if (plan === "pro")` in a component or route, that logic belongs in
  `resolveFeatures`, behind a `Feature`.
- **Italy-only features are detached on the international (EN) market** by the market rule — today
  that's `siaeExport` + `fundraising`. Adding/removing a market rule is a change in `resolveFeatures`,
  not at the call sites.

## Today's state (so you don't over-reach)

- `plan` is **permissive** (no billing yet — Spec 16-core); no feature is plan-gated. Wiring real
  plan gating later is a rule change in `resolveFeatures`, not new call sites.
- `userDisabled` is **designed-for but unwired** — the "disable Cesare" settings toggle + its DB
  persistence land in a later cycle. Don't build the toggle UI ad-hoc; extend the resolver source.

## Testing

- Domain: a truth-table test for `resolveFeatures` (every market × the gated features).
- E2E: assert the hidden-in-EN / visible-in-IT behaviour with the locale fixtures (see the i18n
  market-gate suite).
