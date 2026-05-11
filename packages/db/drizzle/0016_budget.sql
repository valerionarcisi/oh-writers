CREATE TABLE "budgets" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"           uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "currency"             text NOT NULL DEFAULT 'EUR',
  "contingency_percent"  numeric(5,2) NOT NULL DEFAULT 10,
  "shooting_days"        integer,
  "status"               text NOT NULL DEFAULT 'draft'
                           CHECK ("status" IN ('draft','estimated','locked')),
  "generated_at"         timestamptz,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("project_id")
);

CREATE TABLE "budget_lines" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_id"           uuid NOT NULL REFERENCES "budgets"("id") ON DELETE CASCADE,
  "top_sheet"           text NOT NULL
                          CHECK ("top_sheet" IN
                            ('above_the_line','production','crew',
                             'post_production','contingency')),
  "name"                text NOT NULL,
  "cost_type"           text NOT NULL
                          CHECK ("cost_type" IN
                            ('daily','flat','weekly','unit','percentage')),
  "quantity"            numeric,
  "rate"                numeric,
  "actual"              numeric,
  "notes"               text,
  "linked_element_id"   uuid REFERENCES "breakdown_elements"("id")
                          ON DELETE SET NULL,
  "linked_category"     text,
  "sort_order"          integer NOT NULL DEFAULT 0,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "budget_rates" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_id"  uuid NOT NULL REFERENCES "budgets"("id") ON DELETE CASCADE,
  "rate_key"   text NOT NULL,
  "value"      numeric NOT NULL,
  UNIQUE ("budget_id", "rate_key")
);
