# Spec 18b — i18n Implementation (IT/EN) + Market Gating

Status: **Planned** · 2026-06-02. Sub-spec of [18-i18n](18-i18n.md), which it extends
with (a) the testid-prep that protects the E2E suite, (b) **market gating** (hide
Italian-market features in English), and (c) the corrected as-built facts below.

## Why now

The product is currently hardcoded Italian. To reach the international market it must
run in English, and — critically — **in English the Italian-market-only features must be
hidden** (SIAE export, bandi/fundraising), because they are meaningless outside Italy.

## Corrected facts vs spec 18 (verified in code 2026-06-02)

- `Locale` + `Locales = { IT: "it", EN: "en" }` **already exist** in
  `packages/domain/src/constants.ts` — reuse, do NOT redefine. The `*_LABELS_IT`
  maps + `constants.test.ts` are the established precedent for user-facing copy in domain.
- Next migration number is **0036** (not 0024). Drizzle dir: `packages/db/drizzle/`.
- `<html lang="en">` is hardcoded in `apps/web/app/routes/__root.tsx` — must become dynamic.
- **`tests/l10n-leaks.spec.ts` actively asserts "Italian present / English absent."** Once
  EN is reachable this silently mis-guards. It MUST become locale-scoped (assert IT only
  under an `it` fixture user). This is the highest test-side risk.
- **~232 text-coupled E2E locators** (`getByText` + `getByRole({name})`) assert hardcoded
  Italian; they break when strings become keys. (749 `getByTestId` already exist — testid
  is the established convention.)
- Existing seed/fixture users must be backfilled to `locale='it'` or the whole UI "switches
  to English" and ~200 suites break. Migration DEFAULT is `'en'` (new intl users); existing
  rows get a backfill `UPDATE users SET locale='it'`.

## Decisions

- **No i18n library** (per spec 18). Typed key-value dict in `packages/domain/src/i18n/`,
  `useTranslation` hook, `LocaleProvider`. ~200-300 keys; a completeness test guards EN==IT.
- **SSR-authoritative locale.** Locale resolves on the SERVER (loader: `users.locale` →
  `Accept-Language` header → `'en'`), is serialised into the SSR payload, and the client
  provider initialises from that exact value — never re-detects on mount (avoids `<html lang>`
  hydration mismatch). `navigator.language` is read server-side via `Accept-Language`, not at
  client mount.
- **Market gate is a deep module / narrow interface.** `Market = "it" | "intl"`,
  `marketFromLocale(locale)` + `isItalianMarket(locale)` in domain; `useMarket()` /
  `useIsItalianMarket()` in web. Components ask "am I in the Italian market?", never check the
  locale directly. Gated: SIAE export menu item, the Opportunities/fundraising route + nav entry.
- **testid-first.** A prep phase swaps the ~232 text-coupled locators to `data-testid` BEFORE
  any string is extracted, so the i18n PRs touch zero test files and the suite stays green.

## Phases / PR boundaries

**PR-0 — testid prep sweep.** UI text unchanged (still 100% IT). Add stable English
`data-testid` to the asserted/interactive elements; rewrite the ~232 `getByText`/`getByRole(name)`
locators to `getByTestId`. Convention `{feature}-{element}-{role}`, lists `{feature}-row-{id}`.
Verify DS primitives forward `data-testid`. Leave `l10n-leaks.spec.ts` copy-assertions as-is
(testid would defeat the guard) — handled in PR-2/3. Per-feature commits, each green.

**PR-1 — i18n foundation (no visible string change).**
- `packages/domain/src/i18n/keys.ts` (`translations = { en, it } as const`, `TranslationKey`),
  `i18n/format.ts` (`formatDate`/`formatNumber` via `Intl`), `i18n/market.ts`
  (`Market`, `marketFromLocale`, `isItalianMarket`), `i18n/index.ts`, + tests
  (completeness EN==IT, market, format). Reuse `Locale` from constants. Export from domain barrel.
- `apps/web/app/features/i18n/`: `locale-context.tsx` (`LocaleProvider`, `useLocale`),
  `useTranslation.ts`, `useMarket.ts`, `index.ts`.
- `apps/web/app/server/context.ts`: `AppUser.locale: Locale` (non-optional), resolved from
  `users.locale`; anonymous → `Accept-Language` → `'en'`.
- `__root.tsx`: resolve locale (header-based at root), `<html lang={locale}>`, mount
  `LocaleProvider` as the OUTERMOST provider; serialise locale into loader data; client
  initialises from it.
- `packages/db/src/schema/users.ts`: `locale: text("locale").notNull().default("en")`;
  migration **0036_add_users_locale** (`ALTER TABLE users ADD COLUMN locale text NOT NULL
  DEFAULT 'en';` + backfill `UPDATE users SET locale='it'` for existing rows). Seed + fixtures
  user set to `'it'`.

**PR-2 — extract nav + shell (highest value).** `apps/web/app/features/app-shell/nav.ts`
(keep framework-agnostic: pass a `t`/`locale` in, no React hook import), `routes/_app.tsx`
(section label maps + inline strings + relative-time helper → locale-aware), `Sidebar.tsx`
(labels + `title`). Keys `nav.*`, `navGroup.*`, `status.*`, `action.*`. **Migrate
`l10n-leaks.spec.ts` to be `it`-fixture-scoped here.**

**PR-3 — market gating.** `useIsItalianMarket()` hides: the "Esporta SIAE" ActionsMenu item
(`routes/_app.projects.$id_.soggetto.tsx`), the Opportunità nav entry (`Sidebar.tsx`), and a
`beforeLoad` redirect on `routes/_app.projects.$id_.opportunities.tsx` when market is `intl`
(server-side so SSR/direct-nav redirects before render — no IT flash). + `tests/market-gate.spec.ts`.

**PR-4 — locale selector + persistence.** `UserSettingsPage.tsx` `LanguageSection` (react-aria
select, `data-testid="locale-select"`), `updateUserLocale` server fn (Zod `z.enum(["it","en"])`,
neverthrow). On success `router.invalidate()` (full loader re-resolve so `<html lang>` + SSR
locale update without hydration desync). + `tests/i18n-locale-switch.spec.ts`.

**PR-5+ — bulk extraction**, one feature directory per PR, same pattern; each green because
Phase-0 testids decoupled the suite from copy.

## Risks

- `l10n-leaks.spec.ts` mis-guard once EN exists → must be `it`-scoped (PR-2).
- Fixture/seed locale must be `'it'` or ~200 suites flip to English.
- SSR `<html lang>` hydration mismatch → server is the single source; client never re-detects.
- `nav.ts` must stay framework-agnostic (pass translator/locale, no hook import).
- Locale resolution must always return a concrete `Locale`, never `undefined` (CLAUDE.md null/undefined rule).

## Verification

1. `pnpm --filter @oh-writers/domain test` (completeness EN==IT, market, format).
2. `pnpm --filter @oh-writers/db migrate` on scratch DB — column + default + backfill.
3. `pnpm typecheck` — `TranslationKey` exhaustiveness catches `t("typo")`.
4. Full E2E as `it` fixture — all existing suites green (proves testid + extraction invisible).
5. New E2E as `en` fixture — locale-switch, market-gate (opportunities redirect, SIAE absent), `html[lang="en"]`, nav English.
6. View-source as EN user — English + `lang="en"` in SSR HTML (no hydration-only locale).
