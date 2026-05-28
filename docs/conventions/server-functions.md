# Server Functions

Every client→server interaction goes through `createServerFn`. No tRPC, no raw fetch to internal endpoints.

## Three rules — spec 23

1. **Loaders return `ResultAsync<T, E>`, never `Promise<T | null>`.**
   A "not found" is a typed error (`XNotFoundError`), not a `null`. This is what makes `.andThen` chains work end-to-end.

2. **Every authenticated handler goes through `withProjectAccess`.**
   The helper at `~/server/pipeline` bootstraps `getDb`, resolves project access at the requested permission level, and runs the body inside a single chain. No more `requireUser()` + `getDb()` + `resolveAccess()` + `canEdit/canView()` boilerplate per handler.

3. **Inside the body, prefer `.andThen` / `.map` / `.mapErr` over imperative `if (isErr)` branching.**
   ts-pattern's `.match()` is for the _consumer boundary_ (UI rendering, client mutations), not for server function bodies.

## Canonical handler shape

```typescript
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { ResultAsync, ok, err } from "neverthrow";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";

// Read handler — projectId in input
export const getBudget = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "view", ({ db, access }) =>
        findBudgetWithLines(db, access.project.id),
      ),
    ),
  );

// Write handler with child-entity input (lineId → derive projectId)
export const updateBudgetLine = createServerFn({ method: "POST" })
  .validator(z.object({ lineId: z.string().uuid(), patch: PatchSchema }))
  .handler(async ({ data }) =>
    toShape(
      await ResultAsync.fromSafePromise(getDb()).andThen((db) =>
        findBudgetLineRowById(db, data.lineId).andThen((line) =>
          findBudgetRowById(db, line.budgetId).andThen((budget) =>
            requireProjectAccess(db, budget.projectId, "edit").andThen(() => {
              if (budget.status === "locked")
                return errAsync(new BudgetLockedError());
              return ResultAsync.fromPromise(
                db
                  .update(budgetLines)
                  .set(patch)
                  .where(eq(budgetLines.id, data.lineId))
                  .returning(),
                (e) => new DbError("updateBudgetLine", e),
              );
            }),
          ),
        ),
      ),
    ),
  );
```

Every server function that mutates data needs:

- Zod input validation via `.validator()`
- `withProjectAccess` (or `requireProjectAccess` for child-entity lookups) — handles auth + permission gate
- `toShape()` at the return boundary (converts neverthrow Result to JSON-safe `ResultShape`)

Never: re-implement permission checks (`canView`/`canEdit` etc) inside individual server files. The helper at `~/server/access` is the canonical implementation.
