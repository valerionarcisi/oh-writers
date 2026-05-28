# Database

- Schema files in `packages/db/schema/` — one file per entity
- Never modify schema without a migration: `pnpm db:migrate:create`
- Types always inferred from Drizzle — never written by hand
- All queries inside `createServerFn` handlers — never on the client
