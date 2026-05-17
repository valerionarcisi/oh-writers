ALTER TABLE "scenes" ADD COLUMN "effort" integer NOT NULL DEFAULT 2;
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_effort_range" CHECK (effort BETWEEN 1 AND 5);
