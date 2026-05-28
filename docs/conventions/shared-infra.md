# Shared Infrastructure

Centralized utilities — never duplicate these in feature files.

| What                                     | Where                            | Used by                                             |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `ResultShape`, `toShape`, `unwrapResult` | `packages/utils/src/result.ts`   | Every server file + every hook                      |
| `ForbiddenError`, `DbError`              | `packages/utils/src/errors.ts`   | Every feature's errors file (re-exported)           |
| `requireUser`                            | `apps/web/app/server/context.ts` | Every server function handler                       |
| `getDb`, `Db`                            | `apps/web/app/server/db.ts`      | Every server function handler                       |
| `stripYjsState`, `stripYjsSnapshot`      | `apps/web/app/server/helpers.ts` | Server files that return DB rows with binary fields |
| Branded types, constants, Zod schemas    | `packages/domain/src/`           | Everywhere                                          |
