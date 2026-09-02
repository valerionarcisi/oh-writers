# Spec 88 — Free-tier launch: legal baseline with AI off

Status: **Done** (2026-09-02)
Depends on: [[Spec 84]] (`Features.AI_ENABLED` — the master AI switch this spec relies on, unmodified)

## Context

A three-role legal audit (GDPR/privacy, ToS/consumer-law, IP/copyright) found Oh
Writers not ready for a public launch: no Privacy Policy, ToS, or Cookie Policy in
the repo, no consent captured at signup, no cookie notice, no clause on
AI-generated-text ownership, and no data-export path (only delete-account).

No lawyer is available right now, and Cesare (the AI assistant) will **not** be
part of this launch. That second decision collapses most of the audit's scope:
with AI off, there is no AI-generated-content ownership clause to write, no
Anthropic/OpenRouter/Langfuse processor to disclose, and no AI Act transparency
obligation to meet yet (that lands separately — see [[Spec 87]] AI Act compliance
baseline, written for when Cesare is re-enabled; not touched by this spec).

What remains is a minimal, honest legal baseline for a free tier that collects
only account data (name, email, session cookie): draft Privacy Policy + ToS,
consent at signup, and a cookie notice — plus confirming Cesare is genuinely
invisible with AI off.

## Solution

Ship the free tier with:

1. **Cesare fully off** — achieved via existing `Features.AI_ENABLED` machinery
   ([[Spec 84]] §5), by deploying with no `ANTHROPIC_API_KEY` and no
   `AI_TRIAL_QUOTA_EUR` configured. **No code change** — `resolveAiEnabled`
   already returns `false` in this configuration for every user, hiding Cesare
   drawer/dock, margin notes, breakdown AI actions, and generator CTAs behind
   the existing "Attiva l'AI" banner. This spec's only job here is verifying it,
   not building it.
2. **Draft Privacy Policy + ToS**, marked "DRAFT — pending legal review", IT/EN,
   scoped to what the free tier actually collects (name, email, session cookie —
   no AI processor to disclose).
3. **Mandatory consent checkbox** at signup, gating account creation.
4. **A cookie notice** covering the one cookie that exists (session/auth), no
   accept/reject choice since nothing is optional to reject.

## User Stories

1. As a prospective user, I want to read a Privacy Policy before signing up, so
   that I know what data is collected and why.
2. As a prospective user, I want to read Terms of Service before signing up, so
   that I understand what I'm agreeing to.
3. As a prospective user, I want the Privacy Policy and ToS to be honest about
   their draft status, so that I'm not misled into thinking they've had legal
   review they haven't had.
4. As a prospective user, I cannot create an account without explicitly
   accepting the ToS and Privacy Policy, so that consent is actually captured,
   not assumed.
5. As a first-time visitor, I want to be told a session cookie is in use, so
   that I'm not tracked without notice.
6. As a first-time visitor, I don't want to be forced into an accept/reject
   choice for a cookie that isn't optional, so that the notice doesn't lie
   about a choice that doesn't exist.
7. As Valerio (product owner), I want Cesare to be provably invisible in this
   launch configuration, so that the reduced legal scope (no AI processor
   disclosure, no AI Act obligation) is actually true of the shipped product,
   not just the intent.
8. As a returning user, I want the cookie notice to not reappear once
   dismissed, so that it doesn't nag on every visit.
9. As a future session picking this up, I want the AI Act compliance items
   deferred (not solved) here, so that re-enabling Cesare has a clear, already
   written follow-up ([[Spec 87]]) rather than a gap.

## Implementation Decisions

- **AI-off mechanism**: deploy-config only (unset `ANTHROPIC_API_KEY`, leave
  `AI_TRIAL_QUOTA_EUR` unset, no BYOK connect path exposed). Explicitly rejected:
  a new kill-switch env var short-circuiting `resolveAiEnabled` — the existing
  provider/trial/env-key resolution already yields `false` in this
  configuration; a second switch would be redundant code for a decision the
  flag system already makes correctly.
- **Legal-content routes**: two new flat top-level routes, `/privacy` and
  `/terms`, following the existing `login.tsx`/`register.tsx` pattern (standalone
  page, no `_app` shell, no nav chrome — just the root providers). Static
  content per locale, no `createServerFn`.
- **Controller identity in the draft text**: Valerio Narcisi, individual,
  Italy, `valerio.narcisi@gmail.com` as contact — accurate for a solo
  pre-company launch; a lawyer or incorporation event replaces this later.
- **Consent checkbox**: one combined checkbox on `RegisterForm`
  ("Accetto i Termini di Servizio e l'Informativa Privacy"), with inline links
  to `/terms` and `/privacy`, required to submit. Validated with a `.refine()`
  on the register Zod schema (`accepted === true`), following the existing
  `path`/`message`-via-`t()` refine idiom used for password-confirmation
  matching elsewhere in the codebase. Native `<input type="checkbox">`
  controlled component — no checkbox primitive exists in `packages/ui` today,
  and this repo's convention for checkboxes elsewhere is a plain native input;
  introducing a new primitive for one checkbox is out of scope.
- **Cookie notice**: single-button dismiss ("Capito"), using the existing
  `Banner` primitive (`variant="info"`) mounted in `__root.tsx` alongside
  `<Outlet/>` so it appears on every route including `/login`/`/register`.
  Dismissed state persisted in `localStorage`, following the exact pattern of
  the existing `use-ai-off-banner-dismissed.ts` hook (string sentinel `"1"`,
  small dedicated hook rather than inline calls). No accept/reject pair: the
  only cookie is strictly necessary (session/auth), which under GDPR/ePrivacy
  requires notice, not consent — an accept/reject UI would imply a choice that
  doesn't exist.
- **i18n**: new copy goes through `packages/domain/src/i18n/keys/` as flat
  dotted keys (e.g. `legal.privacy.*`, `legal.terms.*`, `auth.register.consent*`,
  `cookieBanner.*`), matching the existing `authKeys` shape (`{ en: {...}, it:
{...} }` merged into `AREA_DICTS`) — not raw literals, not a new JSON file
  format.
- **Worktree cleanup** (prerequisite, unrelated to the legal work itself): the
  `ai-act-compliance-split-view-c51623` worktree has no commits ahead of
  `main` — only two uncommitted spec drafts. Renumber and land them on `main`
  as their own commit before this spec's work starts, since `85` collides with
  the already-merged [[Spec 85]] (deepen-access-authority-seams): the
  versions-split-view draft becomes **Spec 86**, the AI Act draft becomes
  **Spec 87** (referenced above as the forward-looking companion to this
  spec). Then remove the worktree.

## Testing Decisions

- **AI-off verification**: a Playwright E2E asserting that with the launch env
  config (no `ANTHROPIC_API_KEY`, no trial quota), no Cesare entry point
  renders anywhere reachable from dashboard, project pages, or settings —
  extending the existing AI-off-banner coverage rather than writing a new
  suite from scratch.
- **Register consent**: a unit/component test on `RegisterForm` asserting
  submission is blocked with the checkbox unchecked and the correct
  `t()`-sourced error shows, following the existing pattern used for the
  password-confirmation `.refine()` test.
- **Cookie banner**: a small unit test on the new dismissed-state hook
  (mirroring the existing `use-ai-off-banner-dismissed` test, if one exists)
  plus an E2E check that it doesn't reappear after dismiss-and-reload.
- **Legal routes**: a smoke E2E that `/privacy` and `/terms` render in both
  locales and are linked from `RegisterForm`.

## Out of Scope

- Any AI-generated-content ownership clause, AI processor disclosure, or AI
  Act transparency work — deferred to [[Spec 87]], applies only when Cesare is
  re-enabled.
- Data export (only delete-account exists today) — a real gap the legal audit
  flagged, but not blocking for an AI-off free tier with minimal data
  collection; track separately.
- A settings-page toggle for cookie/tracking preferences — moot while the only
  cookie is strictly necessary.
- Actual legal review of the drafted Privacy Policy/ToS text — these ship
  explicitly marked DRAFT pending review; this spec does not claim legal
  sign-off.
- Domain purchase / naming — explicitly parked by Valerio for a separate,
  later session once names are decided.
- [[Spec 86]] (versions split-view compare) — landed on `main` as part of this
  spec's worktree-cleanup prerequisite, but its own design work is unrelated
  and untouched here.

## Further Notes

The reduction in scope here (audit → "no AI, no lawyer" → this spec) is itself
a decision worth remembering: it is _why_ the legal baseline is small. If AI is
re-enabled before this ships, or before [[Spec 87]] lands, re-run the legal
audit's AI-ownership and processor-disclosure findings — they were deferred,
not resolved.
