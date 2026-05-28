# Error Handling

We use **neverthrow** for explicit, typed error handling. Errors are values — not exceptions, not `throw`, not silent `null` returns.

The philosophy: **write the error cases first, then the happy path**. The return type of a function should tell you everything that can go wrong before you read the body.

## The two types

```typescript
import { Result, ResultAsync, ok, err, okAsync, errAsync } from "neverthrow";

// Use Result for synchronous operations
const parseSceneNumber = (raw: string): Result<number, ValidationError> => {
  const n = parseInt(raw);
  return isNaN(n) ? err(new ValidationError("Invalid scene number")) : ok(n);
};

// Use ResultAsync for everything async (DB, API calls, file I/O)
// This is what you'll use 90% of the time
const findProject = (
  id: ProjectId,
): ResultAsync<Project, NotFoundError | DbError> =>
  ResultAsync.fromPromise(
    db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .then((rows) => rows[0]),
    (e) => new DbError("findProject", e),
  ).andThen((row) => (row ? ok(row) : err(new NotFoundError("project", id))));
```

## Domain error types

Shared errors (`ForbiddenError`, `DbError`) live in `packages/utils/src/errors.ts`. Domain-specific errors live in `feature.errors.ts`, co-located with the feature.

Error classes are **plain value objects** (not extending `Error`) so they serialize cleanly over the JSON wire. `Error` methods (message, stack) are non-enumerable and lost in JSON round-trips; own properties survive.

```typescript
// packages/utils/src/errors.ts — shared across all features
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
```

```typescript
// features/projects/projects.errors.ts — domain-specific + re-exports shared
import { ForbiddenError, DbError } from "@oh-writers/utils";
export { ForbiddenError, DbError };

export class ProjectNotFoundError {
  readonly _tag = "ProjectNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Project not found: ${id}`;
  }
}
```

The `_tag` field lets ts-pattern discriminate errors without `instanceof`.

## Chaining with .andThen

Use `.andThen` to chain operations that can each fail. The chain short-circuits on the first error — no nested if/else, no try/catch.

```typescript
// Each step declares what it can return wrong.
// If any step fails, the rest is skipped.
const loadProjectForEditor = (
  id: ProjectId,
  userId: UserId,
): ResultAsync<
  ProjectWithScreenplays,
  NotFoundError | ForbiddenError | DbError
> =>
  findProject(id)
    .andThen((project) =>
      canUserAccess(project, userId)
        ? ok(project)
        : err(new ForbiddenError("access project")),
    )
    .andThen((project) =>
      loadScreenplays(project.id).map((screenplays) => ({
        ...project,
        screenplays,
      })),
    );
```

## Handling results — exhaustive matching

Always handle both branches. Use ts-pattern for exhaustive matching on typed errors.

```typescript
import { match } from "ts-pattern";

const result = await loadProjectForEditor(id, userId);

match(result)
  .with({ isOk: true }, ({ value }) => {
    openEditor(value);
  })
  .with({ isErr: true, error: { _tag: "NotFoundError" } }, ({ error }) => {
    showToast(`Project not found: ${error.id}`);
  })
  .with({ isErr: true, error: { _tag: "ForbiddenError" } }, ({ error }) => {
    showToast(`You cannot ${error.action}`);
  })
  .with({ isErr: true, error: { _tag: "DbError" } }, () => {
    showToast("Something went wrong, please retry");
  })
  .exhaustive();
```

## The server/client boundary — ResultShape

neverthrow's `Result` has methods (`.isOk()`, `.map()`) that don't survive JSON serialization. At the server function boundary, convert to `ResultShape` using `toShape()`. On the client, use `unwrapResult()` to convert back for TanStack Query mutations.

```typescript
// packages/utils/src/result.ts — centralized, one copy
import type { Result } from "neverthrow";

export type ResultShape<T, E> =
  | { readonly isOk: true; readonly value: T }
  | { readonly isOk: false; readonly error: E };

export const toShape = <T, E>(result: Result<T, E>): ResultShape<T, E> => ...;
export const unwrapResult = <T>(result: { isOk: boolean; ... }): T => ...;
```

```typescript
// server — returns ResultShape
export const getProject = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ResultShape<Project, ...>> => {
    await requireUser();
    const db = await getDb();
    return toShape(await findProject(db, data.id));
  });

// client hook — unwraps for TanStack Query
import { unwrapResult } from "@oh-writers/utils";

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => unwrapResult(await createProject({ data: input })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["projects"] }),
  });
};
```

## When to use throw

Only for truly unexpected errors — things that should never happen and indicate a bug, not a domain condition.

```typescript
// Ok to throw — this is a programming error, not a domain error
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

// Never throw for domain conditions — use Result
if (!project) throw new Error("Not found"); // ← wrong, use NotFoundError + err()
```
