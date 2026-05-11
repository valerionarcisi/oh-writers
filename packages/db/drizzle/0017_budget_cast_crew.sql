CREATE TABLE "budget_cast" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_id"       uuid NOT NULL REFERENCES "budgets"("id") ON DELETE CASCADE,
  "element_id"      uuid REFERENCES "breakdown_elements"("id") ON DELETE SET NULL,
  "name"            text NOT NULL,
  "days"            numeric NOT NULL DEFAULT 1,
  "day_rate"        numeric NOT NULL DEFAULT 0,
  "fiscal_regime"   text NOT NULL DEFAULT 'piva'
                      CHECK ("fiscal_regime" IN ('piva','privato','none')),
  "meal_allowance"  numeric NOT NULL DEFAULT 0,
  "accommodation"   numeric NOT NULL DEFAULT 0,
  "sort_order"      integer NOT NULL DEFAULT 0,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "budget_crew" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_id"       uuid NOT NULL REFERENCES "budgets"("id") ON DELETE CASCADE,
  "role_key"        text,
  "name"            text NOT NULL,
  "department"      text NOT NULL,
  "days"            numeric NOT NULL DEFAULT 1,
  "day_rate"        numeric NOT NULL DEFAULT 0,
  "fiscal_regime"   text NOT NULL DEFAULT 'piva'
                      CHECK ("fiscal_regime" IN ('piva','privato','none')),
  "meal_allowance"  numeric NOT NULL DEFAULT 0,
  "accommodation"   numeric NOT NULL DEFAULT 0,
  "enabled"         boolean NOT NULL DEFAULT true,
  "sort_order"      integer NOT NULL DEFAULT 0,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);
