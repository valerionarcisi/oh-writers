-- Spec 84 (Wave 3) — which account paid for a call. Every ai_usage row now
-- records whether it ran on the platform key (onboarding trial) or a user's
-- own BYOK provider, so the trial quota check can SUM(cost_usd) scoped to
-- source='platform' without conflating it with BYOK spend the user already
-- pays for on their own account.
ALTER TABLE "ai_usage" ADD COLUMN "source" text NOT NULL DEFAULT 'platform';
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_source_check" CHECK ("source" IN ('platform', 'user'));
