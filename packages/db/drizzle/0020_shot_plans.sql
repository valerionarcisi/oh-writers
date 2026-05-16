ALTER TABLE schedules
  ADD COLUMN effort_weights jsonb;

CREATE TABLE shot_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id    uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  active_scenario_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id)
);

CREATE TABLE shot_plan_scenarios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_plan_id uuid NOT NULL REFERENCES shot_plans(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'Plan A',
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id        uuid NOT NULL REFERENCES shot_plan_scenarios(id) ON DELETE CASCADE,
  position           integer NOT NULL DEFAULT 0,
  shot_size          text NOT NULL,
  camera_movement    text NOT NULL,
  estimated_minutes  real,
  notes              text,
  camera_label       text NOT NULL DEFAULT 'A',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transition_slots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id       uuid NOT NULL REFERENCES shot_plan_scenarios(id) ON DELETE CASCADE,
  after_shot_id     uuid NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  type              text NOT NULL,
  estimated_minutes real,
  rule_id           text,
  is_manual         boolean NOT NULL DEFAULT false,
  label             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shot_plans
  ADD CONSTRAINT fk_active_scenario
  FOREIGN KEY (active_scenario_id)
  REFERENCES shot_plan_scenarios(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX ON shot_plans (project_id);
CREATE INDEX ON shot_plan_scenarios (shot_plan_id);
CREATE INDEX ON shots (scenario_id);
CREATE INDEX ON shots (position);
CREATE INDEX ON transition_slots (scenario_id);
CREATE INDEX ON transition_slots (after_shot_id);
