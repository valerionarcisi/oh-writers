-- Spec 44 WP-B — resumable Cesare chat threads.
-- Each row represents one (project × user) thread. Future chat persistence
-- will record session_id on every message; for now the table seeds a single
-- "Default" session per (project × user) pair so existing chats stay grouped.
CREATE TABLE "cesare_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "last_message_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "cesare_sessions_project_user_idx"
  ON "cesare_sessions" ("project_id", "user_id");

-- Seed: a Default session for each (project × user) combination so any future
-- chat persistence can attach to a guaranteed-existing row. We hit the
-- cartesian product through the same access logic that gates Cesare today:
-- personal-owner projects (team_id IS NULL) seed for the owner only; team
-- projects seed for every team_members row.
INSERT INTO "cesare_sessions" ("project_id", "user_id", "title")
SELECT p.id, p.owner_id, 'Sessione principale'
FROM "projects" p
WHERE p.team_id IS NULL AND p.owner_id IS NOT NULL;

INSERT INTO "cesare_sessions" ("project_id", "user_id", "title")
SELECT p.id, tm.user_id, 'Sessione principale'
FROM "projects" p
JOIN "team_members" tm ON tm.team_id = p.team_id
WHERE p.team_id IS NOT NULL;
