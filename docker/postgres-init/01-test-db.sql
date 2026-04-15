-- Auto-create the test database on first container init.
-- This runs only when the postgres volume is empty (first `dev:up` or after `dev:nuke`).
-- For existing volumes, run: pnpm test:setup
CREATE DATABASE "oh-writers_test" OWNER "oh-writers";
