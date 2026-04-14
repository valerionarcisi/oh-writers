# Spec 16 — Multi-Tenancy, Billing & Feature Gating

## Overview

Oh Writers serves two distribution models from a single codebase:

1. **SaaS** (`app.ohwriters.com`) — self-service, shared infrastructure, subscription plans
2. **Dedicated** (`oh.<customer>.com`) — isolated instance per customer, separate database, custom domain

Both models share the same feature gating logic. The difference is where the data lives and how the customer pays.

---

## Tenant Model

### Two Modes: Independent or Team

A user is either an **independent** (works alone, owns their projects directly) or a **team member** (projects belong to the team). These are not mutually exclusive — a user can have personal projects AND be part of one or more teams.

```
independent user
├── projects (owner_id = user.id, team_id = NULL)
│   ├── documents, screenplays, scenes, ...

team
├── teamMembers
├── projects (team_id = team.id, owner_id = NULL)
│   ├── documents, screenplays, scenes, ...
```

The existing `projects` table already supports this with the CHECK constraint: `owner_id IS NOT NULL OR team_id IS NOT NULL`.

### The "Billing Entity"

Plans and subscriptions attach to the entity that owns the projects:

- **Independent user** → subscription on `users` (via `user_id` in subscriptions table)
- **Team** → subscription on `teams` (via `team_id` in subscriptions table)

A user who has both personal projects AND is part of a team has two separate billing contexts:

- Their personal subscription (governs their personal projects)
- The team's subscription (governs team projects, managed by team owner)

### No Migration Needed

The current schema stays as-is. No "default team" creation. The dual-ownership pattern is the correct model — it reflects the real-world distinction between a freelance screenwriter working alone and a production company working as a team.

---

## Row Level Security (RLS)

RLS ensures data isolation at the database level. Even if application code has a bug (missing WHERE clause), a tenant cannot see another tenant's data.

### How It Works

1. Every request sets session variables: `app.current_user_id` (always) and `app.current_team_id` (when operating in team context)
2. RLS policies allow access to projects where `owner_id = current_user` OR `team_id = current_team`
3. Drizzle queries don't need manual WHERE clauses — RLS handles isolation

### Implementation

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenplays ENABLE ROW LEVEL SECURITY;
-- ... all other tenant-scoped tables

-- The app sets these on every connection:
-- SET LOCAL app.current_user_id = '<user-uuid>';
-- SET LOCAL app.current_team_id = '<team-uuid>';  (empty string if no team context)

-- Policy: user sees their own projects + their team's projects
CREATE POLICY project_access ON projects
  USING (
    owner_id = current_setting('app.current_user_id')::uuid
    OR team_id = current_setting('app.current_team_id', true)::uuid
  );

-- For nested tables (scenes → screenplays → projects):
CREATE POLICY scene_access ON scenes
  USING (screenplay_id IN (
    SELECT s.id FROM screenplays s
    JOIN projects p ON p.id = s.project_id
    WHERE p.owner_id = current_setting('app.current_user_id')::uuid
       OR p.team_id = current_setting('app.current_team_id', true)::uuid
  ));
```

### Setting the Context

```typescript
const setAccessContext = async (
  db: Db,
  userId: string,
  teamId: string | null,
): Promise<void> => {
  await db.execute(sql`SET LOCAL app.current_user_id = ${userId}`);
  await db.execute(sql`SET LOCAL app.current_team_id = ${teamId ?? ""}`);
};
```

This runs inside the same transaction as the query, so it's connection-safe even with connection pooling (Neon pgbouncer).

### Performance Note

RLS policies on nested tables (scenes, characters, aiPredictions) that require joins can be slow. Mitigation options:

- Add `team_id` directly to frequently-queried nested tables (denormalization)
- Use materialized views for complex queries
- Monitor query plans — Neon provides `pg_stat_statements`

Decision: **start with join-based policies, denormalize only when measured performance requires it**. Premature denormalization adds migration complexity.

---

## Plans & Subscriptions

### New Tables

```sql
CREATE TABLE plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,       -- 'free', 'pro', 'enterprise'
  display_name text NOT NULL,             -- 'Free', 'Pro', 'Enterprise'
  stripe_price_id text,                   -- null for free, Stripe price ID for paid
  max_projects    integer,                -- null = unlimited
  max_members     integer,                -- null = unlimited
  max_ai_calls_month integer,             -- null = unlimited
  features    jsonb NOT NULL DEFAULT '[]', -- array of feature slugs
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one of user_id or team_id must be set
  user_id             uuid REFERENCES users(id) ON DELETE CASCADE,
  team_id             uuid REFERENCES teams(id) ON DELETE CASCADE,
  plan_id             uuid NOT NULL REFERENCES plans(id),
  stripe_customer_id  text,               -- Stripe customer ID
  stripe_subscription_id text,            -- Stripe subscription ID
  status              text NOT NULL DEFAULT 'active',  -- active, past_due, canceled, trialing
  current_period_start timestamp,
  current_period_end   timestamp,
  cancel_at            timestamp,          -- scheduled cancellation
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now(),
  CONSTRAINT owner_xor_team CHECK (
    (user_id IS NOT NULL AND team_id IS NULL) OR
    (user_id IS NULL AND team_id IS NOT NULL)
  ),
  CONSTRAINT one_subscription_per_user UNIQUE (user_id),
  CONSTRAINT one_subscription_per_team UNIQUE (team_id)
);

CREATE TABLE usage_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Same pattern: tracks usage for a user or a team
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  team_id     uuid REFERENCES teams(id) ON DELETE CASCADE,
  metric      text NOT NULL,              -- 'ai_calls', 'pdf_exports', 'storage_bytes'
  value       integer NOT NULL DEFAULT 1,
  recorded_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT usage_owner_xor_team CHECK (
    (user_id IS NOT NULL AND team_id IS NULL) OR
    (user_id IS NULL AND team_id IS NOT NULL)
  )
);

-- Indexes for fast usage aggregation
CREATE INDEX idx_usage_user_metric_month
  ON usage_records (user_id, metric, recorded_at) WHERE user_id IS NOT NULL;
CREATE INDEX idx_usage_team_metric_month
  ON usage_records (team_id, metric, recorded_at) WHERE team_id IS NOT NULL;
```

### Seed Plans

```sql
INSERT INTO plans (name, display_name, max_projects, max_members, max_ai_calls_month, features) VALUES
('free', 'Free', 1, 1, 5, '["logline", "synopsis", "pdf_export_watermark"]'),
('pro', 'Pro', 10, 5, 100, '["logline", "synopsis", "outline", "treatment", "screenplay", "ai_assist", "breakdown", "pdf_export", "collaboration"]'),
('enterprise', 'Enterprise', NULL, NULL, NULL, '["logline", "synopsis", "outline", "treatment", "screenplay", "ai_assist", "breakdown", "budget", "schedule", "storyboard", "locations", "calendar", "pdf_export", "collaboration", "custom_domain", "dedicated_instance"]');
```

---

## Feature Gating

### Feature Registry

```typescript
// packages/domain/src/features.ts

export const Features = {
  LOGLINE: "logline",
  SYNOPSIS: "synopsis",
  OUTLINE: "outline",
  TREATMENT: "treatment",
  SCREENPLAY: "screenplay",
  AI_ASSIST: "ai_assist",
  BREAKDOWN: "breakdown",
  BUDGET: "budget",
  SCHEDULE: "schedule",
  STORYBOARD: "storyboard",
  LOCATIONS: "locations",
  CALENDAR: "calendar",
  PDF_EXPORT: "pdf_export",
  PDF_EXPORT_WATERMARK: "pdf_export_watermark",
  COLLABORATION: "collaboration",
  CUSTOM_DOMAIN: "custom_domain",
  DEDICATED_INSTANCE: "dedicated_instance",
} as const;

export type Feature = (typeof Features)[keyof typeof Features];
```

### Server-Side Check

Every server function that touches a gated feature calls `requireFeature()`. The plan is resolved from the project's owner — either the user (personal project) or the team.

```typescript
// apps/web/app/server/features.ts

// A "billing owner" is either a user or a team
type BillingOwner =
  | { type: "user"; userId: string }
  | { type: "team"; teamId: string };

// Resolve billing owner from a project
const getBillingOwner = (project: {
  ownerId: string | null;
  teamId: string | null;
}): BillingOwner =>
  project.teamId
    ? { type: "team", teamId: project.teamId }
    : { type: "user", userId: project.ownerId! };

export const requireFeature = (
  owner: BillingOwner,
  feature: Feature,
): ResultAsync<void, FeatureNotAvailableError | DbError> =>
  getPlan(owner).andThen((plan) =>
    plan.features.includes(feature)
      ? ok(undefined)
      : err(new FeatureNotAvailableError(feature, plan.name)),
  );

export const requireQuota = (
  owner: BillingOwner,
  metric: string,
): ResultAsync<void, QuotaExceededError | DbError> =>
  getPlan(owner).andThen((plan) => {
    const limit = getLimit(plan, metric);
    if (limit === null) return ok(undefined); // unlimited
    return getCurrentUsage(owner, metric).andThen((usage) =>
      usage < limit
        ? ok(undefined)
        : err(new QuotaExceededError(metric, limit, usage)),
    );
  });
```

### Client-Side Check

The client receives the current context's plan and features (loaded per project, since personal and team projects may have different plans). The UI uses this to:

- **Show gated tabs** with a lock icon and "Pro"/"Enterprise" badge — clicking opens upgrade modal
- **Disable** features at quota limit (grey out AI assist button)
- **Never hide tabs entirely** — users should see what they're missing

```typescript
// Hook for components — resolves plan from current project context
const useFeature = (
  feature: Feature,
): {
  isAvailable: boolean;
  plan: PlanName;
  upgradeUrl: string;
} => {
  const { plan } = useProjectContext(); // plan comes from the project's billing owner
  return {
    isAvailable: plan.features.includes(feature),
    plan: plan.name,
    upgradeUrl: `/settings/billing?upgrade=${feature}`,
  };
};
```

### Plan Visibility in Tab Strip

The project tab strip (Write / Breakdown / Schedule / Budget / Locations) shows:

- **Available tabs**: normal, clickable
- **Gated tabs**: visible but with a lock icon and "Pro" or "Enterprise" badge, clicking opens upgrade modal
- **Never hide tabs entirely** — users should see what they're missing

---

## Stripe Integration

### Flow: SaaS Subscription

```
User clicks "Upgrade to Pro"
  → Client calls createCheckoutSession({ planId })
  → Server creates Stripe Checkout Session
  → User redirected to Stripe Checkout
  → Stripe processes payment
  → Stripe webhook → POST /api/webhooks/stripe
  → Server updates subscription table
  → Server invalidates plan cache for the team
  → Next request: team has Pro features
```

### Webhook Events to Handle

| Event                           | Action                                                |
| ------------------------------- | ----------------------------------------------------- |
| `checkout.session.completed`    | Create subscription, update team plan                 |
| `invoice.paid`                  | Extend subscription period                            |
| `invoice.payment_failed`        | Mark subscription as `past_due`, notify team owner    |
| `customer.subscription.updated` | Sync plan changes (upgrade/downgrade)                 |
| `customer.subscription.deleted` | Mark as `canceled`, revert to free plan at period end |

### Webhook Handler

```typescript
// apps/web/app/routes/api.webhooks.stripe.ts

export const Route = createAPIFileRoute("/api/webhooks/stripe")({
  POST: async ({ request }) => {
    const sig = request.headers.get("stripe-signature");
    const body = await request.text();
    const event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);

    // Process event...
    // Always return 200 quickly — process async if needed
    return new Response("ok", { status: 200 });
  },
});
```

### Pricing Page

Not a spec concern — pricing strategy is a business decision. The system supports:

- Monthly billing
- Annual billing (Stripe handles the discount)
- Free trial period (via Stripe subscription trials)
- Coupon codes (Stripe promotions)

---

## Dedicated Instances

### What a Dedicated Instance Is

Same Docker image, same codebase, deployed separately with its own:

- Database (Neon branch or separate Neon project)
- Environment variables
- Custom domain (CNAME → Fly.io or Netlify)
- Optionally: own region (EU, US, etc.)

### What a Dedicated Instance Is NOT

- Not a fork of the codebase
- Not a different version of the software
- Not self-hosted by the customer (we manage it)

### Provisioning Flow (Manual Initially)

```
1. Sales closes enterprise deal
2. Ops creates:
   a. Neon database (new project or branch)
   b. Fly.io app (or Netlify site) with custom domain
   c. DNS CNAME record
   d. Environment variables (DB, Stripe customer, branding)
3. Run migrations + seed
4. Create admin user for the customer
5. Customer accesses oh.<company>.com
```

Automation (self-service provisioning) is a future optimization. For the first 5-10 enterprise customers, manual setup is fine.

### Dedicated Instance Configuration

```typescript
// Environment variables that differ per dedicated instance
INSTANCE_MODE=dedicated           // 'saas' | 'dedicated'
INSTANCE_SLUG=centuryfox          // unique identifier
INSTANCE_DOMAIN=oh.centuryfox.com
INSTANCE_BRANDING_NAME=CenturyFox Writers
INSTANCE_BRANDING_LOGO_URL=...    // optional custom logo
INSTANCE_PLAN=enterprise          // always enterprise for dedicated
DATABASE_URL=...                  // instance-specific Neon connection
```

### Shared vs Dedicated Code Paths

The codebase checks `INSTANCE_MODE` in very few places:

| Concern        | SaaS           | Dedicated                    |
| -------------- | -------------- | ---------------------------- |
| Billing UI     | Shown (Stripe) | Hidden (invoiced separately) |
| Plan selection | User chooses   | Always enterprise            |
| Signup         | Self-service   | Admin creates users          |
| Branding       | Oh Writers     | Custom name/logo from env    |
| Data isolation | RLS            | Physical (separate DB)       |

Everything else is identical.

---

## New Error Types

```typescript
// packages/utils/src/errors.ts

export class FeatureNotAvailableError {
  readonly _tag = "FeatureNotAvailableError" as const;
  readonly message: string;
  constructor(
    readonly feature: string,
    readonly currentPlan: string,
  ) {
    this.message = `Feature "${feature}" is not available on the ${currentPlan} plan`;
  }
}

export class QuotaExceededError {
  readonly _tag = "QuotaExceededError" as const;
  readonly message: string;
  constructor(
    readonly metric: string,
    readonly limit: number,
    readonly current: number,
  ) {
    this.message = `Quota exceeded for ${metric}: ${current}/${limit}`;
  }
}
```

---

## What Changes in Existing Code

### Schema Changes (Migration)

1. Create `plans` table
2. Create `subscriptions` table (FK to users OR teams, XOR constraint)
3. Create `usage_records` table (same dual-owner pattern)
4. Assign free plan subscription to all existing users and teams
5. Enable RLS on all tenant-scoped tables
6. Create RLS policies (dual: owner_id OR team_id)

### Auth Context Changes

`requireUser()` stays as-is (returns user + session). Feature gating is resolved **per project**, not per session, because the same user may have a Free personal subscription and be part of a Pro team.

### Server Function Changes

Every mutation that touches a gated feature resolves the billing owner from the project:

```typescript
// Before (existing)
const user = await requireUser();
const project = await findProject(db, data.projectId);

// After — add feature check based on who owns the project
const user = await requireUser();
const project = await findProject(db, data.projectId);
const owner = getBillingOwner(project);
await requireFeature(owner, Features.BREAKDOWN);
```

### UI Changes

- Tab strip shows lock icons on gated features
- Upgrade modal component
- Settings page with billing/plan management
- Usage dashboard (AI calls used this month, projects count, etc.)

---

## Implementation Order

This spec is large. Build it in layers:

### Layer 1 — Foundation (do now, before other features)

1. `plans` + `subscriptions` + `usage_records` tables (seed with free/pro/enterprise)
2. Auto-assign free plan on user registration and team creation
3. `BillingOwner` type + `requireFeature()` + `requireQuota()` server helpers
4. Feature check in existing server functions (no-op for now — everyone is "enterprise" during dev)

### Layer 2 — Billing (when ready to charge)

5. Stripe integration (checkout, webhooks, customer portal)
6. Billing settings page
7. Upgrade/downgrade flow
8. Usage tracking (`usage_records`)

### Layer 3 — Gating UI (when plans are live)

9. Lock icons on tab strip
10. Upgrade modal
11. Usage dashboard
12. Watermark on free-tier PDF exports

### Layer 4 — Dedicated (when first enterprise customer)

13. `INSTANCE_MODE` env var and conditional rendering
14. Provisioning runbook (manual)
15. Custom domain setup
16. RLS policies (critical for SaaS, defense-in-depth for dedicated)

---

## Risks

### RLS Performance

Join-based RLS policies on nested tables (scenes, characters) may slow queries. Monitor with `EXPLAIN ANALYZE` and denormalize `team_id` only where measured.

### Stripe Webhook Reliability

Webhooks can fail or arrive out of order. Stripe retries for 3 days. The handler must be idempotent (processing the same event twice produces the same result).

### Plan Downgrades

If a Pro user downgrades to Free, they have 10 projects but the limit is 1. Policy: **read-only access to existing projects, cannot create new ones until under the limit**. Never delete user data on downgrade.

### Independent-to-Team Transition

A user who starts as independent (personal projects) may later join or create a team. Their personal projects stay personal (under their own subscription). New team projects use the team's subscription. There is no "move project to team" feature initially — this is a future enhancement if users request it.

---

## What This Spec Does NOT Cover

- Pricing strategy (how much to charge) — business decision
- Marketing site / public pricing page — separate frontend
- Admin dashboard for managing dedicated instances — future spec
- GDPR data export/deletion per tenant — future spec, required before EU launch
- SOC2 compliance — future, if enterprise customers require it
