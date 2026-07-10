# Spec 84 — Provider settings & BYOK: the user brings the account that pays

Status: **Draft**
Depends on: [[Spec 83]] (AI Gateway — the per-user provider resolution lives in its pipeline)

## Context

Oh Writers cannot go to production with the platform's own Anthropic key funding
every user's AI usage. Product decision (2026-07-09, final revision): **Oh Writers
does not resell inference.** The subscription (~€10/month) pays for the product —
editor, context logic (Film Bible, skills, local context), Cesare orchestration,
versioning. **All LLM cost lives on the user's own provider account**, connected
through the in-app wizard (§2). Pricing stays flat and low because the heaviest
AI user costs Oh Writers the same as the lightest.

Two consequences drive the design:

- The users are **screenwriters and directors**, not developers — the wizard is
  the critical UX asset: Italian, guided, with signup happening inside the OAuth
  flow and credit problems detected and explained in-app.
- **Onboarding trial quota (recommended, feature-flagged)**: a small one-time
  AI allowance (~€1) on the platform key at signup, metered by the [[Spec 83]]
  ledger (`user_id`), so the user experiences Cesare BEFORE meeting the wizard.
  The wow moment must precede the credit card. This is marketing cost, not
  inference reselling, and `Features.AiTrialQuota` OFF removes it entirely.

### The "AI SSO" landscape (verified 2026-07-09 — revisit before implementing)

The ideal flow — "Sign in with <provider> and bill my existing AI plan" — is **not
offered by any first-party provider** today:

- **Anthropic** — "Sign in with Claude" exists, but since April 2026 subscriptions
  no longer cover third-party app usage: users must buy prepaid _extra usage
  credits_ or use an API key. The monthly Agent SDK credit applies only to apps
  built on the Claude Agent SDK; Oh Writers is a Messages-API app.
- **OpenAI** — "Sign in with ChatGPT" is identity-only (a "Sign in with Google"
  equivalent); it does not let a third-party app spend the user's plan. Plan-funded
  usage ships only inside OpenAI's own Codex tooling.
- **Google** — no official mechanism; proxying the Gemini CLI OAuth token was
  explicitly banned in February 2026 with account suspensions.
- **OpenRouter** — offers exactly this flow, officially, for any app: **OAuth PKCE**.
  The user clicks "Connect", authorizes on openrouter.ai, and the app receives a
  **user-controlled API key** billed to the user's OpenRouter balance. One
  connector → hundreds of models, Anthropic's included.

Conclusion: OpenRouter PKCE is the connector; first-party SSO connectors are
parked until provider policies change.

## Decision

### 1. Per-user provider configuration (new domain: `features/ai-providers/`)

A user (account-level, not per-project) has a provider configuration:

```
provider:  "openrouter" | "anthropic" | "platform"
apiKey:    encrypted at rest (see §4); absent for "platform"
models:    { haiku: string; sonnet: string }   // tier → concrete model ID
```

The [[Spec 83]] gateway resolves `ModelIntent.tier` through this config (pipeline
step 3): same router, same tiers, per-user models and credentials. Callers do not
change.

### 2. Connection flows (user settings, reached from the TopBar avatar)

1. **"Collega il tuo account AI" (default path)** — the OpenRouter wizard (§2.2).
   Every AI feature beyond the trial quota requires a connected provider. A user
   without one sees a clear, friendly gate ("Collega il tuo account AI per usare
   Cesare") — never a broken or silent state.
2. **Platform key — onboarding trial only** — gated via `resolveFeatures`
   (`Features.AiTrialQuota`, OFF = no trial): a small one-time allowance metered
   through `ai_usage.user_id`. Exhausted → typed `AiQuotaExceededError` whose UI
   state launches the wizard. There is no ongoing platform-funded tier.
3. **The OpenRouter wizard** — in-app, Italian copy, launched from user settings,
   from the AI gate above, and offered as an optional, dismissible step after
   signup — never blocking login:
   - Step 1 (in Oh Writers): explains in plain language what it is and what it
     costs ("~5€ coprono un lungometraggio intero"), then one button.
   - Step 2 (on openrouter.ai, unavoidable): the standard OAuth PKCE (S256)
     redirect to `https://openrouter.ai/auth?callback_url=<app>&code_challenge=…&code_challenge_method=S256`.
     **If the user has no account, OpenRouter's own auth page handles signup
     in-flow** ("Continue with Google" ≈ 30s). There is NO API to create an
     OpenRouter account on the user's behalf — automating their pages would
     violate ToS; the wizard embraces the redirect instead of fighting it.
   - Step 3 (in Oh Writers): the callback route exchanges the code at
     `POST https://openrouter.ai/api/v1/auth/keys` (with `code_verifier`,
     held server-side in the session) and stores the returned user-controlled
     key. The wizard then runs the validation call and a **credit check**: on
     a zero-balance account it explains and deep-links to
     `https://openrouter.ai/credits`, then re-checks on return.
   - Step 4 (in Oh Writers): model choice (§3) — then back to work.

   **OpenRouter API surface used in-app** (everything except OAuth consent and
   the top-up checkout stays inside Oh Writers):
   - `GET /api/v1/credits` / `GET /api/v1/key` — remaining balance and key
     limits, shown in settings ("ti restano ~X€ di AI") and used by the
     wizard's credit check.
   - `GET /api/v1/models` — live model catalogue with pricing for the model
     picker (§3), curated list filtered from it.

4. **Manual key (power users)** — paste an Anthropic or OpenRouter key;
   validated with one cheap live call (`haiku` tier, ~10 output tokens) before
   saving.

Disconnection revokes locally (delete row) and returns the user to the
connect-provider gate; the key itself is the user's to manage on the provider
side.

> Implementation note: OpenRouter also offers a provisioning-keys API (sub-keys
> with spend limits under OUR account). Not used here — the platform default
> stays on Anthropic direct (no OpenRouter fee) with ledger quotas — but it is
> the documented fallback if per-user limit enforcement ever needs to move
> provider-side.

### 3. Model choice: free, guided, and NEVER hardcoded

Decision (2026-07-10, Valerio): **no model ID is hardcoded anywhere in the UI or
in defaults** — new models must appear as providers ship them, with zero code
changes.

- The picker is fed **entirely by the live catalogue** (`GET /api/v1/models`),
  fetched server-side and cached briefly (~1h). Prices shown are computed from
  the catalogue's own pricing metadata, translated to €/feature-film.
- **"Consigliati" is a filter rule, not a list**: the latest Anthropic-family
  models from the live catalogue, grouped into the two Cesare tiers by the
  catalogue's own pricing (cheapest tier ↔ `haiku` slot, quality tier ↔
  `sonnet` slot). The rule lives in ONE server-side function; when Anthropic
  ships a new model it appears automatically.
- **"Avanzate"** exposes the full catalogue (all providers). Choosing an
  untested model shows a persistent notice that Cesare quality is only
  guaranteed on the recommended models. UI copy Italian, as always.
- **Per-user defaults are resolved at connect time** from the same rule (the
  then-current recommended pair) and stored on `ai_providers.models`; the user
  can change them anytime. The stored pair is a user choice snapshot, not a
  code constant.
- Prompt-caching note: OpenRouter passes `cache_control` through to Anthropic
  models — verify at implementation time and record the outcome here.

### 4. Key security

- Encrypted at rest with AES-256-GCM under `AI_KEY_ENCRYPTION_SECRET` (new env,
  required in production; documented in `.env.example`).
- Never logged (existing CLAUDE.md hard rule), never returned to the client after
  save — the settings UI shows provider + last 4 characters only.
- Decryption happens inside the gateway only, at call time.

### 5. AI-off state — the app without AI is a complete product

When a user has **no working AI source** (no connected provider AND trial quota
absent/exhausted), Oh Writers degrades to a fully AI-less product, per the
existing feature-flag convention (OFF = hidden — never disabled-greyed, never
broken):

- New catalogue entry `Features.AiEnabled`, resolved **server-side** from
  provider state (connected key valid) OR remaining trial quota.
- OFF hides **every** AI surface: the Cesare drawer and dock affordances,
  editorial-advice panels and margin notes, breakdown AI actions, document
  generators' CTAs, and any tracer/version affordance that only exists for AI
  edits. No dead buttons, no error states — the surfaces are simply not there.
- The only trace of AI is **one dismissible banner** ("Attiva l'AI di Cesare")
  that opens the wizard; dismissal is remembered per user.
- This state doubles as a product tier: the base subscription can be priced
  product-only (pricing itself is out of scope here) since an AI-less Oh
  Writers is still a complete writing/production tool.

### 6. Errors out of existence

A revoked/exhausted user key surfaces as a typed `AiProviderError` (neverthrow,
`_tag`) with a UI state that links back to the provider settings — never a silent
failure, never a fallback to the platform key (that would silently move costs back
to us).

## Non-goals

- First-party SSO connectors (Claude / ChatGPT / Gemini) — blocked by provider
  policy as of July 2026; revisit if Anthropic opens Messages-API third-party
  billing.
- Billing UI, plan quotas, or usage dashboards (the `pnpm ai:costs` report and the
  ledger cover observability for now).
- Per-project provider overrides.

## Tests

- `OHW-841` unit: gateway resolves provider config per user (openrouter /
  anthropic / platform-trial); unknown provider fails fast; trial quota resolved
  via `Features.AiTrialQuota` and metered from the ledger; trial exhausted →
  `AiQuotaExceededError` (sad path); connected-provider users never touch the
  platform key.
- `OHW-842` unit: key encryption roundtrip; decrypted value never appears in logs
  (assert on the logger spy); settings server fn returns masked key only.
- `OHW-843` unit: PKCE helpers — verifier/challenge generation (S256), callback
  exchange happy path + provider-error sad path (mocked fetch).
- `OHW-844` E2E (mock): settings page — connect flow reachable from avatar → user
  settings; manual key save shows masked key; disconnect clears it. Sad path:
  invalid manual key → validation error shown, nothing saved.
- `OHW-845` E2E (mock): with a revoked-key fixture, a Cesare turn shows the
  provider-error state with the link to settings (no silent platform fallback).
- `OHW-846` E2E (mock): AI-off state — with no provider and exhausted trial,
  no Cesare drawer/advice/breakdown-AI surface renders anywhere (OFF = hidden);
  exactly one dismissible "Attiva l'AI" banner appears, opens the wizard, and
  stays dismissed across reloads. Sad path: `Features.AiEnabled` back ON →
  surfaces return without stale banner.
