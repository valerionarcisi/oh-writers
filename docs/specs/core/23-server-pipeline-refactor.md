# Spec 23 — Server pipeline refactor

> Status: draft · Date: 2026-05-15 · Owner: Valerio
> Discussion driver: server functions full of if-soup and mixed `Promise<X | null>` / `ResultAsync` paradigms. We chose neverthrow up-front but never built the affordances that make it ergonomic. This spec adds them, without changing libraries.

---

## 1. The problem we are fixing

`grep "if (" apps/web/app/features/{budget,breakdown,screenplay-editor}/server/` counts:

- `budget.server.ts` — 90 `if (`
- `breakdown.server.ts` — 50 `if (`
- `llm-spoglio.server.ts` — 27 `if (`
- `screenplay.server.ts` — 11 `if (`

Most are not domain branches: they are boilerplate that should never have been written by a human. Concretely, every mutating server function repeats this body:

```typescript
const user = await requireUser();
const db = await getDb();
const access = await resolveBudgetAccessByProjectId(db, user.id, projectId);
if (access.isErr()) return toShape(err(access.error));
if (!canEdit(access.value))
  return toShape(err(new ForbiddenError("…")));
// … real logic, eventually …
const x = await loadX(db, …);
if (!x) return toShape(err(new NotFoundError(…)));
const y = await ResultAsync.fromPromise(loadY(db, x), (e) => new DbError("…", e));
if (y.isErr()) return toShape(err(y.error));
// …
```

This is 6–10 lines of noise before the function does anything domain-specific. It repeats 40+ times across the codebase. Worse, the pattern is inconsistent:

- Some loaders return `Promise<X | null>` (e.g. `loadBudgetWithLines`). Callers wrap in `ResultAsync.fromPromise` and then check `null` separately.
- Some loaders return `ResultAsync<X, DbError>` and use `null` semantics with errors. Mixed.
- `.andThen` is almost never used. Every step gets its own `if (x.isErr()) return`.
- IIFE patterns like `await (async () => { … })()` appear because the author wanted local-scoped chaining but didn't reach for `.andThen`.

The library is not the problem. The conventions around it are.

## 2. Decision: stay on neverthrow, add the missing scaffolding

We considered Effect-TS. Rejecting it for now because:

- Effect's biggest wins (Layer-based DI, `Effect.gen`, structured concurrency, retry policies) solve problems we *don't have at scale* yet.
- A migration would rewrite every `createServerFn` and every hook. Weeks of churn for a system that ships fine on the current foundation.
- 70% of the actual pain is conventions, not library capability.

We will revisit Effect-TS in spec 24 **only if** the residual pain after this refactor is concentrated in the AI orchestration code (`llm-spoglio.server.ts`, `cesare-suggest.server.ts`) where `Schedule.retryNTimes`, `Stream.fromAsyncIterable`, and timeouts would actually compress code meaningfully. That is the only carve-out we're considering.

## 3. The three rules

### Rule 1 — Loaders always return `ResultAsync<T, E>`. Never `Promise<T | null>`.

A "not found" is a typed error, not a `null`. This is a hard rule.

```typescript
// Wrong — what most of the codebase does today
const loadBudget = (db: Db, projectId: string): Promise<Budget | null> => …;

// Right — what this spec mandates
const loadBudget = (
  db: Db,
  projectId: ProjectId,
): ResultAsync<Budget, BudgetNotFoundError | DbError> =>
  ResultAsync.fromPromise(rawQuery(db, projectId), (e) => new DbError("loadBudget", e))
    .andThen((row) => (row ? ok(row) : err(new BudgetNotFoundError(projectId))));
```

This single change eliminates roughly **40% of the `if (!x) return …` lines**, because handlers can now `.andThen` straight through.

### Rule 2 — Every authenticated handler goes through `serverPipeline`.

A new helper in `packages/utils/src/server-pipeline.ts`:

```typescript
import { ResultAsync, ok, err } from "neverthrow";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import { ForbiddenError, DbError } from "./errors";
import type { AppUser } from "~/server/context";

type Permission = "view" | "edit";

export type ServerCtx = { user: AppUser; db: Db };

export type AccessResolver = (
  db: Db,
  userId: string,
  scopeId: string,
) => ResultAsync<AccessLevel, ForbiddenError | DbError>;

export type AccessLevel = {
  isPersonalOwner: boolean;
  teamRole: "owner" | "editor" | "viewer" | null;
};

const canEdit = (a: AccessLevel) =>
  a.isPersonalOwner || a.teamRole === "owner" || a.teamRole === "editor";
const canView = (a: AccessLevel) => a.isPersonalOwner || a.teamRole !== null;

/** Authenticate, load db, resolve access, gate by permission, then run body. */
export const withAccess = <T, E>(args: {
  scopeId: string;
  permission: Permission;
  resolveAccess: AccessResolver;
  action: string; // shown in ForbiddenError
  body: (ctx: ServerCtx) => ResultAsync<T, E>;
}): ResultAsync<T, E | ForbiddenError | DbError> =>
  ResultAsync.fromPromise(
    Promise.all([requireUser(), getDb()]),
    (e) => new DbError("withAccess.bootstrap", e),
  )
    .andThen(([user, db]) =>
      args
        .resolveAccess(db, user.id, args.scopeId)
        .andThen((access) => {
          const allowed =
            args.permission === "edit" ? canEdit(access) : canView(access);
          return allowed
            ? ok<ServerCtx, ForbiddenError>({ user, db })
            : err<ServerCtx, ForbiddenError>(new ForbiddenError(args.action));
        }),
    )
    .andThen(args.body);
```

Handlers become:

```typescript
export const getBudget = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(({ data }) =>
    toShape(
      await withAccess({
        scopeId: data.projectId,
        permission: "view",
        resolveAccess: resolveBudgetAccessByProjectId,
        action: "view budget",
        body: ({ db }) => loadBudget(db, data.projectId),
      }),
    ),
  );
```

3–5 lines, no `if`, no nested `isErr` checks. The error union is exactly the same as before, fully tracked.

### Rule 3 — Use `.andThen` / `.map` / `.mapErr`, not imperative `isErr` branching.

Inside the `body`, chain transformations:

```typescript
// Wrong
const handler = async ({ user, db }) => {
  const project = await loadProject(db, projectId);
  if (project.isErr()) return err(project.error);
  const screenplay = await loadScreenplay(db, project.value.id);
  if (screenplay.isErr()) return err(screenplay.error);
  return ok({ project: project.value, screenplay: screenplay.value });
};

// Right
const handler = ({ db }) =>
  loadProject(db, projectId).andThen((project) =>
    loadScreenplay(db, project.id).map((screenplay) => ({ project, screenplay })),
  );
```

ts-pattern's `.match()` stays the right tool **only at the consumer boundary**
(client mutations, UI rendering), not inside server function bodies.

## 4. Migration plan

### Phase 1 — Scaffolding (1 file)

- Create `packages/utils/src/server-pipeline.ts` with `withAccess`, `ServerCtx`,
  `AccessLevel`, `Permission`.
- Move `canEdit` / `canView` here as the canonical implementation. Delete the
  duplicate copies in feature files.
- Export from `packages/utils/src/index.ts`.

### Phase 2 — Pilot on `budget.server.ts` (worst offender)

- Rewrite all 9 server functions there to use `withAccess`.
- Convert every loader (`loadBudgetWithLines`, `loadRateOverrides`,
  `resolveVersionId`, etc.) to return `ResultAsync<X, NotFoundError | DbError>`.
- Kill the `Promise<X | null>` return type everywhere in the file.
- Expected reduction: ~55 `if (` → ~20. ~30% lines fewer.

### Phase 3 — Review pilot

If the pilot looks good, migrate in order of pain:

1. `breakdown.server.ts` (~50 `if (`)
2. `screenplay.server.ts` (~11 `if (`)
3. `schedule.server.ts`, `documents.server.ts`, `versions/*.server.ts`
4. `llm-spoglio.server.ts` (~27 `if (`) — partial; this file may keep some imperative flow until spec 24

### Phase 4 — Establish the rule in CLAUDE.md

Add to the "Server Functions" section:

> Every authenticated server function MUST go through `withAccess`. Loaders MUST return `ResultAsync<T, E>` — never `Promise<T | null>`. Inside the body, prefer `.andThen` / `.map` over imperative `isErr` checks.

## 5. What stays out of scope

- **Effect-TS adoption.** Re-evaluated in spec 24 after this refactor lands.
- **DI layer / `Context.Tag`-style boundaries.** Not needed; `withAccess` is
  enough.
- **Stream/Effect-based AI orchestration.** `llm-spoglio.server.ts` keeps its
  imperative shell for now; revisit when retry/timeout/streaming policies
  become a real source of bugs.
- **Changing the `toShape` / `unwrapResult` boundary.** That stays. It is
  the JSON-safe wire format and it works.

## 6. Anti-goals

- We are NOT going to "abstract everything". `withAccess` covers the
  authenticated case only. Unauthenticated server functions (rare) stay
  inline.
- We are NOT introducing new errors. Existing typed errors stay; we just
  make them flow through chains correctly.
- We are NOT rewriting clients. The wire shape (`ResultShape`) is
  unchanged.

## 7. Done criteria

- `withAccess` lives in `packages/utils/src/server-pipeline.ts` with tests.
- `budget.server.ts` migrated. `grep -c "if (" budget.server.ts` drops from
  ~90 to under 30.
- No loader in `budget.server.ts` returns `Promise<T | null>`.
- `pnpm --filter @oh-writers/web typecheck` green.
- A 30-line diff in CLAUDE.md adds the new rules to the "Server Functions"
  section.
- The pattern is documented enough that future server functions stop
  reintroducing the boilerplate.

## 8. Open questions

1. Should `withAccess` accept an `Effect`-like context tagged type for
   future extension? **No.** Keep `ServerCtx` as a plain `{ user, db }`
   object. If we ever switch to Effect, we'll rewrite anyway.
2. Should `resolveAccess` itself be a registered map keyed by entity type
   (project, screenplay, breakdown), so handlers don't have to pass it
   every time? **Tempting, defer to Phase 3** — first see how often the
   resolver actually varies across handlers.
3. Should `ForbiddenError` carry the resolved `AccessLevel` so the UI can
   distinguish "no access at all" vs "view-only"? **Defer** — the UI
   doesn't need it today.
