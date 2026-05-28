# Code Philosophy

These principles guide every decision in this codebase. When two approaches seem equally valid, pick the one that scores better here.

## Don't repeat yourself — but don't over-abstract either

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

## Centralize, don't scatter

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

## Keep cognitive load low

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

## Functional programming — the pragmatic subset

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
