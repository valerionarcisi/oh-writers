# Spec 07 — Core Refactor

## Motivation

The blog post [Dalla meditazione alla programmazione funzionale](https://valerionarcisi.me/blog/dalla-meditazione-alla-programmazione-funzionale/) defines clear principles:

1. **Pure logic separated from framework glue** — `lib/meditation.ts` (73 tests, zero dependencies) vs `pages/api/meditation.ts` (77 lines of glue)
2. **Result as the primary error channel** — `{ ok, value/error }`, composable via `andThen`
3. **pipe for linear composition** — transforms nested calls into readable left-to-right chains
4. **Validation at the boundary** — parse once, trust downstream
5. **Centralize, don't scatter** — one place for each concern

The current codebase follows the spirit but violates rule 5 massively. This spec fixes that.

---

## Problem — Duplicated Infrastructure

### 1. ResultShape + toShape (4 copies)

Identical block in:

- `projects.server.ts` (lines 29–36)
- `documents.server.ts` (lines 22–29)
- `screenplay.server.ts` (lines 22–29)
- `versions.server.ts` (imports from screenplay.server but redefines `toShape`)

### 2. throwOnErr (3+ copies)

Identical function in:

- `useProjects.ts` (lines 36–47)
- `useDocument.ts` (lines 20–29)
- `useScreenplay.ts` / `useVersions.ts`

### 3. requireUser (4 copies)

Identical 4-line function in every server file.

### 4. getDb (4 copies)

Identical dynamic import wrapper in every server file.

### 5. ForbiddenError + DbError (4 copies)

`ForbiddenError` and `DbError` are defined identically in:

- `projects.errors.ts`
- `documents.errors.ts`
- `screenplay.errors.ts`
- `screenplay-versions.errors.ts`

### 6. stripYjsState (3 copies)

Same utility in `projects.server.ts`, `documents.server.ts`, `screenplay.server.ts`.

---

## Solution — Centralize shared infrastructure

### A. `packages/shared/src/result.ts`

New file. Contains everything related to the Result wire format:

```typescript
import type { Result } from "neverthrow";

// JSON-serializable discriminated union for createServerFn boundaries
export type OkShape<T> = { readonly isOk: true; readonly value: T };
export type ErrShape<E> = { readonly isOk: false; readonly error: E };
export type ResultShape<T, E> = OkShape<T> | ErrShape<E>;

// Convert neverthrow Result → wire-safe shape (server boundary)
export const toShape = <T, E>(result: Result<T, E>): ResultShape<T, E> =>
  result.isOk()
    ? { isOk: true as const, value: result.value }
    : { isOk: false as const, error: result.error };

// Unwrap ResultShape → value or throw (client boundary, for TanStack Query mutations)
export const unwrapResult = <T>(result: {
  isOk: boolean;
  value?: T;
  error?: { message: string };
}): T => {
  if (!result.isOk) {
    const domainError = result.error!;
    throw Object.assign(new Error(domainError.message), domainError);
  }
  return result.value as T;
};
```

**Rename**: `throwOnErr` → `unwrapResult` (describes what it does, not how).

### B. `packages/shared/src/errors.ts`

New file. Contains shared error classes used by every domain:

```typescript
// Shared errors — used across all features.
// Domain-specific errors (ProjectNotFoundError, VersionNotFoundError, etc.)
// stay in their feature's errors.ts file.

export class ForbiddenError {
  readonly _tag = "ForbiddenError" as const;
  readonly message: string;
  constructor(readonly action: string) {
    this.message = `Forbidden: ${action}`;
  }
}

export class DbError {
  readonly _tag = "DbError" as const;
  readonly message: string;
  readonly dbCause: string | null;
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    this.message = `DB error in ${operation}`;
    this.dbCause =
      cause instanceof Error ? cause.message : String(cause ?? null);
  }
}

export class UnauthenticatedError {
  readonly _tag = "UnauthenticatedError" as const;
  readonly message = "Unauthenticated" as const;
}
```

**Key change**: `UnauthenticatedError` replaces `throw new Error("Unauthenticated")` — errors as values, not exceptions.

Domain-specific `NotFoundError` variants stay in their feature because the `_tag` and fields differ per domain.

### C. `apps/web/app/server/context.ts` — add `requireUser`

Move `requireUser` here, next to `getUser` where it logically belongs:

```typescript
export const requireUser = async (): Promise<AppUser> => {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
};
```

Note: we keep `throw` here (not Result) because `requireUser` is a guard that runs before any domain logic. An unauthenticated request is a programming/infrastructure concern, not a domain error. The handler never returns `UnauthenticatedError` to the client — it short-circuits.

### D. `apps/web/app/server/db.ts` — centralize `getDb`

```typescript
export const getDb = async () => {
  const { db } = await import("@oh-writers/db");
  return db;
};

export type Db = Awaited<ReturnType<typeof getDb>>;
```

### E. `apps/web/app/server/helpers.ts` — shared server utilities

```typescript
export const stripYjsField = <T extends Record<string, unknown>>(
  row: T,
  ...fields: string[]
): Omit<T, "yjsState" | "yjsSnapshot"> => {
  const copy = { ...row };
  for (const f of fields) delete (copy as Record<string, unknown>)[f];
  return copy as any;
};
```

### F. Feature error files — simplified

Each feature keeps only its domain-specific errors:

```typescript
// projects.errors.ts — after refactor
export { ForbiddenError, DbError } from "@oh-writers/shared";

export class ProjectNotFoundError {
  readonly _tag = "ProjectNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Project not found: ${id}`;
  }
}
```

---

## Refactored Server Function Pattern

Before (current — 500 lines of mixed concerns):

```typescript
// projects.server.ts — every handler does auth + db + permission + logic + serialize
export const updateProject = createServerFn({ method: "POST" })
  .validator(UpdateProjectInput)
  .handler(async ({ data }): Promise<ResultShape<...>> => {
    const user = await requireUser();  // local copy
    const db = await getDb();          // local copy
    // ... 30 lines of mixed permission + query + business logic ...
    return toShape(result);            // local copy
  });
```

After (glue calls pure logic):

```typescript
// projects.server.ts — thin glue layer
export const updateProject = createServerFn({ method: "POST" })
  .validator(UpdateProjectInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = await getDb();
    return toShape(await doUpdateProject(db, user, data));
  });
```

```typescript
// projects.logic.ts — pure domain logic, testable without framework
export const doUpdateProject = (
  db: Db,
  user: AppUser,
  data: UpdateProjectData,
): ResultAsync<Project, ProjectNotFoundError | ForbiddenError | DbError> =>
  findProject(db, data.projectId)
    .andThen((project) => checkEditPermission(db, project, user))
    .andThen((project) => applyUpdate(db, project, data.data));
```

The `.logic.ts` file:

- Receives already-validated data (Zod ran at the boundary)
- Receives `db` and `user` as parameters (no globals, no side effects)
- Returns `ResultAsync` (composable, typed errors)
- Is testable with a real DB but without the framework

---

## Files Created

| File                             | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `packages/shared/src/result.ts`  | `ResultShape`, `toShape`, `unwrapResult`            |
| `packages/shared/src/errors.ts`  | `ForbiddenError`, `DbError`, `UnauthenticatedError` |
| `apps/web/app/server/db.ts`      | `getDb`, `Db` type                                  |
| `apps/web/app/server/helpers.ts` | `stripYjsField`                                     |

## Files Modified

| File                                                                    | Change                                 |
| ----------------------------------------------------------------------- | -------------------------------------- |
| `packages/shared/src/index.ts`                                          | Export new modules                     |
| `apps/web/app/server/context.ts`                                        | Add `requireUser`                      |
| `apps/web/app/features/projects/projects.errors.ts`                     | Re-export shared, keep domain-specific |
| `apps/web/app/features/documents/documents.errors.ts`                   | Same                                   |
| `apps/web/app/features/screenplay-editor/screenplay.errors.ts`          | Same                                   |
| `apps/web/app/features/screenplay-editor/screenplay-versions.errors.ts` | Same                                   |
| `apps/web/app/features/projects/server/projects.server.ts`              | Use shared imports, thin glue          |
| `apps/web/app/features/documents/server/documents.server.ts`            | Same                                   |
| `apps/web/app/features/screenplay-editor/server/screenplay.server.ts`   | Same                                   |
| `apps/web/app/features/screenplay-editor/server/versions.server.ts`     | Same                                   |
| `apps/web/app/features/projects/hooks/useProjects.ts`                   | Import `unwrapResult` from shared      |
| `apps/web/app/features/documents/hooks/useDocument.ts`                  | Same                                   |
| `apps/web/app/features/screenplay-editor/hooks/useScreenplay.ts`        | Same                                   |
| `apps/web/app/features/screenplay-editor/hooks/useVersions.ts`          | Same                                   |

## Files NOT Created

No `*.logic.ts` files in this phase. The logic extraction is a pattern to adopt going forward. The immediate win is eliminating duplication of infrastructure code. Extracting logic into separate files will happen incrementally as each feature is touched.

---

## Migration Strategy

1. Create shared files (`result.ts`, `errors.ts`)
2. Update `packages/shared/src/index.ts` to export them
3. Add `requireUser` to `context.ts`, `getDb` to `db.ts`, `stripYjsField` to `helpers.ts`
4. Refactor each server file one at a time: replace local copies with shared imports
5. Refactor each hook file: replace `throwOnErr` with `unwrapResult`
6. Simplify each error file: re-export shared, keep domain-specific
7. Typecheck
8. Run existing tests — behavior must not change

---

## Test Coverage

No new tests needed — this is a pure refactor with no behavior change. All existing tests (OHW-031 through OHW-072) must pass unchanged.

---

## Out of Scope

- `pipe()` utility — deferred to when we have 3+ places that need it
- `*.logic.ts` extraction — pattern documented, adopted incrementally
- Design system expansion — separate spec (07b)
- CLAUDE.md updates — done as a separate commit after this refactor lands
