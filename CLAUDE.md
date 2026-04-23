# Oh Writers — CLAUDE.md

Before touching any code, read these files in order:

1. `SPEC.md` — product requirements and domain model
2. `docs/architecture.md` — system design and decisions
3. This file

If those files don't exist yet, ask before proceeding.

---

## Workflow

1. Read the relevant feature folder and its schema files first
2. Identify which domain owns the logic (see Domain Boundaries)
3. Validate inputs with Zod before any logic runs
4. Implement server logic in `createServerFn`, client logic in the feature folder
5. Test with Playwright — never skip tests for mutations or critical paths
6. **Code-review the staged diff before every commit** — run the `/code-review` skill on the change, address any critical findings, then commit
7. Commit following the Git conventions below

**Before implementation:** every plan or brainstorm that gets approved must produce a spec file in `docs/specs/` before any code is written. Name it `NN-feature-name.md` (or `NNb-feature-name.md` for sub-specs of an existing numbered spec). The spec is written first, then implementation starts.

When in doubt about an architectural decision, stop and ask.

---

## Documentation Hygiene

### Update automatically — always, without being asked

- **This file (CLAUDE.md)**: if a decision is made during a session that contradicts or extends a rule here, update the relevant section before ending the session. One clear rule, not a paragraph.
- **The spec for the feature being worked on** (`docs/specs/NN-feature.md`): if implementation reveals an error, missing case, or schema change, update the spec to match reality. The spec must always reflect what was actually built, not the original plan.

### Update only when explicitly asked

- `docs/architecture.md` — only when a structural decision changes (new pattern, removed dependency)
- `docs/data-model.md` — only when a table is added, removed, or significantly changed
- `README.md` — only when setup steps or project-level information changes

### Never

- Never update documentation speculatively — only document decisions that have been made
- Never expand a spec with future ideas during implementation — open a new spec file instead
- Never silently diverge from a spec — if implementation requires a different approach, flag it before proceeding

---

## Code Philosophy

These principles guide every decision in this codebase. When two approaches seem equally valid, pick the one that scores better here.

### Don't repeat yourself — but don't over-abstract either

Duplication is a problem. Premature abstraction is a bigger one. The rule:

> Extract shared logic only when the same thing appears in **3 or more places** and the abstraction has an **obvious name**.

```typescript
// Bad — duplicated validation logic in two server functions
export const createProject = createServerFn().handler(async ({ data }) => {
  if (!data.title || data.title.length > 200) throw new Error("Invalid title");
  // ...
});

export const updateProject = createServerFn().handler(async ({ data }) => {
  if (!data.title || data.title.length > 200) throw new Error("Invalid title");
  // ...
});

// Good — Zod schema is the single source of truth, shared by both
const ProjectTitleSchema = z.string().min(1).max(200);

export const createProject = createServerFn()
  .validator(z.object({ title: ProjectTitleSchema }))
  .handler(async ({ data }) => {
    /* ... */
  });

export const updateProject = createServerFn()
  .validator(z.object({ title: ProjectTitleSchema }))
  .handler(async ({ data }) => {
    /* ... */
  });
```

```typescript
// Bad — abstract wrapper that adds complexity without clarity
const withValidatedMutation = <T>(
  schema: z.ZodSchema<T>,
  fn: (data: T) => Promise<unknown>,
) =>
  createServerFn()
    .validator(schema)
    .handler(({ data }) => fn(data));

// Good — just write the server function, it's already short enough
export const createScene = createServerFn()
  .validator(SceneSchema)
  .handler(async ({ data }) => {
    /* ... */
  });
```

### Centralize, don't scatter

Logic that belongs together should live together. Avoid spreading the same concern across multiple files.

```typescript
// Bad — permission logic duplicated in every server function
export const deleteScene = createServerFn().handler(async ({ data }) => {
  const user = await getUser();
  if (user.role !== "owner" && user.role !== "editor")
    throw new Error("Forbidden");
  // ...
});

export const updateScene = createServerFn().handler(async ({ data }) => {
  const user = await getUser();
  if (user.role !== "owner" && user.role !== "editor")
    throw new Error("Forbidden");
  // ...
});

// Good — one function, one place
const canEdit = (role: TeamRole): boolean =>
  role === TeamRoles.OWNER || role === TeamRoles.EDITOR;

export const deleteScene = createServerFn().handler(async ({ data }) => {
  const user = await getUser();
  if (!canEdit(user.role)) throw new Error("Forbidden");
  // ...
});
```

### Keep cognitive load low

Code is read far more than it is written. Optimize for the reader.

- **Short functions**: if a function needs a comment to explain what it does, it should be split
- **One level of abstraction per function**: don't mix high-level orchestration with low-level details in the same function
- **Explicit over clever**: a verbose name is better than a clever one-liner that requires thought to parse
- **No hidden side effects**: a function named `getProject` should never write to the DB

```typescript
// Bad — mixes orchestration, DB logic, and formatting in one function
async function handleProjectLoad(id: string) {
  const raw = await db.select().from(projects).where(eq(projects.id, id));
  if (!raw[0]) return null;
  return {
    ...raw[0],
    title: raw[0].title.trim(),
    createdAt: raw[0].createdAt.toISOString(),
  };
}

// Good — each function does one thing
const findProject = (id: string) =>
  db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .then((rows) => rows[0] ?? null);

const formatProject = (raw: ProjectRow): Project => ({
  ...raw,
  title: raw.title.trim(),
  createdAt: raw.createdAt.toISOString(),
});

// The orchestration reads like prose
const project = await findProject(id);
if (!project) return { ok: false, error: new Error("Not found") };
return { ok: true, value: formatProject(project) };
```

### Functional programming — the pragmatic subset

We use functional ideas where they reduce bugs and noise. We don't use them to be clever.

**What we do:**

- Pure functions for data transformation (same input → same output, no side effects)
- Immutability (never mutate, always return new values)
- `Result` / `ResultAsync` via neverthrow for expected failures (errors as values, not exceptions)
- Composition of small functions via `.andThen`, `.map`, `.mapErr`

**What we don't do:**

- No Effect-TS or similar libraries
- No monads beyond Result/ResultAsync
- No point-free style that sacrifices readability
- No `reduce` where a simple loop is clearer

```typescript
// Good — pure transformation, easy to test
const toSceneNumber = (index: number): string => `${index + 1}.`;

const formatSceneHeader = (scene: Scene, index: number): string =>
  `${toSceneNumber(index)} ${scene.location.toUpperCase()} - ${scene.timeOfDay}`;

// Bad — impure function masquerading as a transformer
const formatSceneHeader = (scene: Scene, index: number): string => {
  analytics.track("scene_formatted"); // side effect — unexpected in a formatter
  return `${index + 1}. ${scene.location.toUpperCase()}`;
};
```

---

## Platform Reach

Oh Writers targets three runtimes, in this order of priority:

1. **Web app** (desktop, primary) — TanStack Start + Monaco editor, full feature set
2. **PWA** (tablet, especially iPad with keyboard) — same codebase as web, installable, offline-aware
3. **Expo companion app** (iOS / Android, mobile-only use cases) — read, review, comment, quick capture, location scouting, push notifications. Scope intentionally narrow: the companion app is **not** a clone of the web editor.

All three runtimes talk to the same backend. Code written today must not close doors to the mobile companion, even though it doesn't exist yet.

### What this means when you write code

- **Domain logic must be framework-agnostic.** Pure functions, Zod schemas, branded types, business rules → live in `packages/domain` and `packages/utils`. No React, no Monaco, no TanStack imports in those packages.
- **Editor-specific glue is isolated.** The Monaco-specific files (`fountain-keybindings.ts`, `fountain-autocomplete.ts`, `fountain-language.ts`) are the only ones that import from `@monaco-editor/react`. The detector, transforms, and constants are editor-agnostic and portable to CodeMirror 6 or any other engine.
- **Auth must support both cookie and bearer token.** Web uses cookie sessions (Better Auth default). The Expo app will use bearer tokens. Server functions and Better Auth config must not hard-depend on cookies.
- **API layer must be callable from outside the web app.** `createServerFn` is the primary path, but any mutation or query that the mobile companion will eventually need must also be reachable via a typed HTTP client. When in doubt about where to put logic, put it behind a server function — never inline in a React component — so it stays accessible.
- **Real-time notifications are a first-class concern.** If a feature generates an event that a collaborator would want to know about (comment, approval, mention, team invite), the event must be published through a channel that both the web app and a future mobile app can subscribe to. Don't rely on polling alone.
- **File operations must be abstracted.** Direct browser-only APIs (`File`, `Blob` download links, `<input type="file">`) should be wrapped in a feature-level function, not called from components. The Expo app will provide the same function backed by `expo-file-system`.

### What this does NOT mean

- Don't write mobile code now. There is no Expo app yet. Don't import from `react-native`, don't add `expo-*` dependencies.
- Don't over-abstract preemptively. Duplication is better than a premature shared layer. Extract only when the second runtime actually materializes.
- Don't design features around mobile-only constraints. The web is the primary product; mobile is a companion.

### Decision triggers

Before merging a feature, ask: "Could a mobile companion reasonably need to call this server function, render this data, or receive a notification for this event?" If yes, make sure the code respects the rules above. If no, don't worry about it.

---

## Stack

| Layer          | Tool                                                     |
| -------------- | -------------------------------------------------------- |
| Framework      | TanStack Start (SSR, file-based routing)                 |
| Routing        | TanStack Router                                          |
| Server calls   | `createServerFn` — the only way to call server logic     |
| Data fetching  | TanStack Query (via `queryOptions` + `useSuspenseQuery`) |
| ORM            | Drizzle + PostgreSQL                                     |
| Auth           | Better Auth (team/org support)                           |
| Editor         | Monaco (screenplay editing)                              |
| Collaboration  | Yjs + y-websocket (real-time sync)                       |
| Styling        | CSS Modules — zero Tailwind, zero CSS-in-JS              |
| Validation     | Zod — single source of truth for all types               |
| Error handling | neverthrow — `Result` and `ResultAsync`                  |
| Testing        | Vitest (unit) + Playwright (E2E)                         |

---

## Never Do

Hard stops. If you are about to do any of these, stop and ask.

- **Never use tRPC** — server calls go through `createServerFn` only
- **Never run DB queries on the client** — all Drizzle calls are inside `createServerFn` handlers
- **Never use `try/catch`** for expected failures — use `ResultAsync.fromPromise` and typed errors
- **Never mutate** state, arrays, or objects directly — always return new values
- **Never write TypeScript types by hand** when they can be inferred from Zod or Drizzle
- **Never use Tailwind**, utility classes, or CSS-in-JS of any kind
- **Never hardcode** hex colors, arbitrary `px` values, or magic numbers in CSS
- **Never use hardcoded border-radius** — use `--radius-*` tokens (`--radius-md` default, `--radius-none` for screenplay page only)
- **Never mix `null` and `undefined`** in the same type — use `null` for intentional absence
- **Never expose the Anthropic API key** to the client
- **Never log** tokens, passwords, or API keys
- **Never add AI signatures** to commits (`Co-Authored-By: Claude` or similar)
- **Never import browser-only or Monaco APIs** inside `packages/domain`, `packages/utils`, or any other shared package — those must stay framework-agnostic so the future mobile companion can consume them
- **Never hard-couple auth to cookies** — Better Auth must remain able to issue bearer tokens for mobile clients
- **Never write code in Italian** — every identifier (variables, functions, types, files), every comment, every log message, every internal error message MUST be in English. UI copy shown to the user is Italian (the product is IT-localised); everything else is English. A function named `caricaSceneggiatura` or a comment `// gestisce errore` is a hard NO. This rule is non-negotiable so that future contributors, AI tooling, and English-speaking collaborators can read the codebase.

---

## Server Functions

Every client→server interaction goes through `createServerFn`. No tRPC, no raw fetch to internal endpoints.

```typescript
import { createServerFn } from "@tanstack/start";
import { ok, err, ResultAsync } from "neverthrow";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";

export const getProject = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<Project, NotFoundError | DbError>> => {
      await requireUser();
      const db = await getDb();
      // ... domain logic using ResultAsync ...
      return toShape(result);
    },
  );

export const projectQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["projects", id],
    queryFn: () => getProject({ data: { id } }),
  });
```

Every server function that mutates data needs:

- Zod input validation via `.validator()`
- Auth check via `requireUser()` (from `~/server/context`)
- Permission check (user can perform this action on this resource)
- `toShape()` at the return boundary (converts neverthrow Result to JSON-safe `ResultShape`)

---

## Domain Boundaries

Co-locate server functions with the feature that owns the domain:

- `features/auth/` — login, session, user
- `features/teams/` — membership, roles, invites
- `features/projects/` — CRUD, genre, format
- `features/documents/` — logline, synopsis, outline, treatment
- `features/screenplay-editor/` — screenplay structure, versions, scenes
- `features/breakdown/` — scene breakdown, element extraction (cast, props, locations, VFX, vehicles, extras, sound)
- `features/budget/` — cost prediction, budget lines, AI estimates
- `features/schedule/` — strip board, shooting days, scene ordering
- `features/locations/` — location candidates, scouting notes, attachments
- `features/predictions/` — all AI generation and estimation calls

---

## Types

### Zod is the source of truth

Never write TypeScript types by hand. Always infer from Zod schemas.

```typescript
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  format: z.enum(["feature", "short", "series_episode", "pilot"]),
  genre: z
    .enum([
      "drama",
      "comedy",
      "thriller",
      "horror",
      "action",
      "sci-fi",
      "documentary",
      "other",
    ])
    .nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;
```

### Drizzle types are inferred too

```typescript
type ProjectRow = typeof projects.$inferSelect;
type NewProject = typeof projects.$inferInsert;
```

### Branded types for IDs

Prevents mixing up entity IDs at the type level.

```typescript
type ProjectId = Brand<string, "ProjectId">;
type ScreenplayId = Brand<string, "ScreenplayId">;
type SceneId = Brand<string, "SceneId">;
```

### Tagged const objects over switch/if-else

```typescript
export const TeamRoles = {
  OWNER: "owner",
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;

export type TeamRole = (typeof TeamRoles)[keyof typeof TeamRoles];
```

### Discriminated unions for domain variants

```typescript
type DocumentType =
  | { type: "logline"; maxLength: 200 }
  | { type: "synopsis"; sections: string[] }
  | { type: "outline"; acts: Act[] }
  | { type: "treatment"; wordCount: number };
```

---

## Error Handling

We use **neverthrow** for explicit, typed error handling. Errors are values — not exceptions, not `throw`, not silent `null` returns.

The philosophy: **write the error cases first, then the happy path**. The return type of a function should tell you everything that can go wrong before you read the body.

### The two types

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

### Domain error types

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

### Chaining with .andThen

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

### Handling results — exhaustive matching

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

### The server/client boundary — ResultShape

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

### When to use throw

Only for truly unexpected errors — things that should never happen and indicate a bug, not a domain condition.

```typescript
// Ok to throw — this is a programming error, not a domain error
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

// Never throw for domain conditions — use Result
if (!project) throw new Error("Not found"); // ← wrong, use NotFoundError + err()
```

---

## React Patterns

### State — useReducer + ts-pattern

```typescript
const reducer = (state: State, action: Action): State =>
  match(action)
    .with({ type: "set/screenplay" }, ({ payload }) => ({
      ...state,
      screenplay: payload,
    }))
    .with({ type: "set/error" }, ({ error }) => ({ ...state, error }))
    .exhaustive();
```

### Action creators are pure functions

```typescript
const actions = {
  setScreenplay: (payload: Screenplay): Action => ({
    type: "set/screenplay",
    payload,
  }),
  setError: (error: Error): Action => ({ type: "set/error", error }),
} as const;
```

### Feature folder structure

Each feature is self-contained. Never reach across feature boundaries directly — use the feature's `index.ts`.

```
features/screenplay-editor/
├── components/
├── hooks/
├── server/        ← createServerFn definitions live here
├── styles/
└── index.ts       ← public API of the feature
```

---

## Shared Infrastructure

Centralized utilities — never duplicate these in feature files.

| What                                     | Where                            | Used by                                             |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `ResultShape`, `toShape`, `unwrapResult` | `packages/utils/src/result.ts`   | Every server file + every hook                      |
| `ForbiddenError`, `DbError`              | `packages/utils/src/errors.ts`   | Every feature's errors file (re-exported)           |
| `requireUser`                            | `apps/web/app/server/context.ts` | Every server function handler                       |
| `getDb`, `Db`                            | `apps/web/app/server/db.ts`      | Every server function handler                       |
| `stripYjsState`, `stripYjsSnapshot`      | `apps/web/app/server/helpers.ts` | Server files that return DB rows with binary fields |
| Branded types, constants, Zod schemas    | `packages/domain/src/`           | Everywhere                                          |

---

## Database

- Schema files in `packages/db/schema/` — one file per entity
- Never modify schema without a migration: `pnpm db:migrate:create`
- Types always inferred from Drizzle — never written by hand
- All queries inside `createServerFn` handlers — never on the client

---

## CSS

Dark modern SaaS — clean, warm, with depth and polish. Content-first. Modern CSS only, no preprocessors, no JS for visuals.

### Hard rules

- CSS Modules only — one `.module.css` per component
- Custom properties for every value — never hardcode hex, px, or magic numbers
- `--radius-md` (8px) as default border-radius. `--radius-none` only for screenplay page representation
- Class names in camelCase
- No Tailwind, no CSS-in-JS, no styled-components
- No Framer Motion or JS animations — CSS transitions only, always behind `prefers-reduced-motion`
- Shadows via `--shadow-*` tokens for elevation hierarchy

### Layout — flexbox first

Use flexbox as the default. Switch to grid only when you need explicit two-dimensional control (e.g. a screenplay page layout, a dashboard grid).

```css
/* Good — flexbox for most layouts */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Good — grid only when 2D structure is needed */
.editorLayout {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-rows: var(--header-height) 1fr;
}
```

### CSS nesting — use it

Native CSS nesting is supported. Use it to keep related styles together. Don't nest more than 2 levels deep.

```css
/* Good */
.button {
  background: var(--color-surface);
  padding: var(--space-2) var(--space-4);

  &:hover {
    background: var(--color-surface-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

/* Bad — flat, hard to see the relationship */
.button {
  background: var(--color-surface);
}
.button:hover {
  background: var(--color-surface-hover);
}
.button:disabled {
  opacity: 0.4;
}
```

### Container queries — not media queries

Components respond to their container, not the viewport. This makes components truly portable.

```css
/* Good — component adapts to its container */
.card {
  container-type: inline-size;
  display: flex;
  flex-direction: column;

  @container (min-width: 400px) {
    flex-direction: row;
  }
}

/* Bad — component tied to viewport width */
.card {
  display: flex;
  flex-direction: column;

  @media (min-width: 768px) {
    flex-direction: row;
  }
}
```

Use `@media` only for truly global concerns: root font size, color scheme (`prefers-color-scheme`), reduced motion.

### Logical properties

Use logical properties instead of physical directions. This handles RTL and writing modes correctly without extra code.

```css
/* Good */
.label {
  margin-inline-end: var(--space-2);
  padding-block: var(--space-1);
  border-inline-start: 2px solid var(--color-accent);
}

/* Bad */
.label {
  margin-right: var(--space-2);
  padding-top: var(--space-1);
  padding-bottom: var(--space-1);
  border-left: 2px solid var(--color-accent);
}
```

Quick reference: `inline` = horizontal axis, `block` = vertical axis.

### Modern selectors — :has(), :is(), :where()

Use them to reduce duplication and express relationships between elements.

```css
/* :is() — apply the same styles to multiple selectors without repeating */
.form :is(input, textarea, select) {
  border: var(--border);
  padding: var(--space-2);
}

/* :has() — style a parent based on its children (no JS needed) */
.field:has(input:invalid) {
  color: var(--color-error);
}

.card:has(img) {
  padding-block-start: 0;
}

/* :where() — same as :is() but zero specificity, safe for overrides */
:where(h1, h2, h3, h4) {
  line-height: 1.1;
  text-wrap: balance;
}
```

### Animations — CSS only

No Framer Motion, no JS for visual transitions. Everything animated lives in CSS.

```css
/* Good — CSS transition for state changes */
.panel {
  opacity: 0;
  translate: 0 var(--space-2);
  transition:
    opacity 150ms ease,
    translate 150ms ease;

  &.isVisible {
    opacity: 1;
    translate: 0 0;
  }
}

/* Good — respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .panel {
    transition: none;
  }
}
```

Always include a `prefers-reduced-motion` rule for any animation that affects layout or opacity.

---

## Naming

| Thing            | Convention                          |
| ---------------- | ----------------------------------- |
| Components       | `PascalCase.tsx`                    |
| Hooks            | `useHookName.ts`                    |
| Server functions | `feature.server.ts`                 |
| Schemas          | `feature.schema.ts`                 |
| CSS Modules      | `ComponentName.module.css`          |
| Booleans         | `isX`, `hasX`, `canX`, `showX`      |
| Action creators  | `setX`, `resetX`, `addX`, `removeX` |
| Transformers     | `toX`, `parseX`, `formatX`          |

---

## Code Comments

Comment only complex logic — not what the code does, but why it exists and how it works. Self-documenting names first; a comment is a last resort.

```typescript
// Bad — describes what the code does
const active = users.filter((u) => u.status === "ACTIVE");

// Good — explains why this edge case exists
// Suspended users retain read access for 30 days for data export
const accessible = users.filter(
  (u) => u.status === "ACTIVE" || u.status === "SUSPENDED",
);
```

---

## Testing

Two test runners, each for its strengths. No Cypress, no Jest.

### Vitest — fast logic tests

Pure functions, parsers, reducers, transformers, schema validation, error handling. Anything that doesn't need a browser.

- Co-locate test files with the code: `feature.server.test.ts` next to `feature.server.ts`
- Run with `pnpm test:unit` (or `pnpm vitest` directly)
- Use `describe` / `it` / `expect` — keep tests flat, no deep nesting

### Playwright — browser and E2E tests

Auth flows, page navigation, editor interactions, collaboration, anything that needs a real browser.

- Test files in `tests/` directory
- Run with `pnpm test` or `pnpm test:e2e`
- Tag format: `[OHW-001]`

### Rules

- Every mutation must have at least one test (Vitest for logic, Playwright for UI)
- Pure functions get Vitest tests — don't spin up a browser to test a parser
- UI interactions and flows get Playwright tests — don't mock the DOM
- Run unit tests first (fast feedback), then E2E

---

## Mock Mode

- `MOCK_AI=true` → AI responses from `mocks/ai-responses.ts`, no Anthropic API calls
- All server functions require a real PostgreSQL database — no mock API layer

---

## Security

- Anthropic API key server-side only — never on the client
- Zod validation on every `createServerFn` via `.validator()`
- Role-based permission check on every mutation
- Never log sensitive data

---

## Git

Commit format: `[OHW] type: description`

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance, dependencies
- `refactor:` no behavior change
- `test:` adding or modifying tests

No AI signatures in commits.
