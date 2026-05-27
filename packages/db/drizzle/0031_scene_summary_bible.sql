-- spec 38: scene summary columns + film bible table

ALTER TABLE scenes
  ADD COLUMN scene_summary jsonb,
  ADD COLUMN scene_summary_fingerprint text;

CREATE TABLE IF NOT EXISTS project_film_bible (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  bible jsonb NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);