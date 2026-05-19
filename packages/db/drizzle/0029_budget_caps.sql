CREATE TABLE budget_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  top_sheet text NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX budget_caps_project_topsheet_uniq
  ON budget_caps (project_id, COALESCE(top_sheet, ''));
